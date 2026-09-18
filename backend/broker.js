// broker.js
//
// Order placement, positions, wallet — for BUY/SELL, exactly like
// Zerodha, Groww, Upstox etc. Backed by Postgres now, so records
// persist across redeploys and restarts.
//
// The wallet here is VIRTUAL funds only — users top it up themselves,
// no real money moves. Letting users deposit REAL money into a
// balance held by your app is a Prepaid Payment Instrument (PPI)
// under RBI rules and needs its own authorization — same category as
// Paytm Wallet, separate from the SEBI broker question. Don't wire a
// real payment gateway into depositFunds() below without that in place.
//
// TO SWITCH TO REAL BROKER ORDERS (Kite Connect etc.), see the header
// comment this file used to carry — the shape of placeOrder/
// getPortfolio below already matches what a real broker integration
// needs, so that swap is unaffected by this Postgres migration.

import { pool, newId } from "./db.js";

export async function getPortfolio(userId) {
  const walletRes = await pool.query("SELECT cash FROM wallets WHERE user_id = $1", [userId]);
  const cash = Number(walletRes.rows[0]?.cash ?? 0);

  const holdingsRes = await pool.query(
    "SELECT symbol, qty, avg_price FROM holdings WHERE user_id = $1 AND qty > 0",
    [userId]
  );
  const ordersRes = await pool.query(
    "SELECT * FROM orders WHERE user_id = $1 ORDER BY placed_at DESC LIMIT 50",
    [userId]
  );

  return {
    cash,
    holdings: holdingsRes.rows.map((h) => ({ symbol: h.symbol, qty: Number(h.qty), avgPrice: Number(h.avg_price) })),
    orders: ordersRes.rows.map(mapOrder),
  };
}

function mapOrder(o) {
  return {
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    qty: Number(o.qty),
    orderType: o.order_type,
    limitPrice: o.limit_price != null ? Number(o.limit_price) : null,
    status: o.status,
    filledPrice: o.filled_price != null ? Number(o.filled_price) : null,
    placedAt: o.placed_at,
    filledAt: o.filled_at,
  };
}

export async function depositFunds(userId, amount) {
  amount = Number(amount);
  if (!amount || amount <= 0) throw new Error("Enter an amount greater than zero");
  if (amount > 10000000) throw new Error("That's above the per-transaction limit");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await client.query(
      "UPDATE wallets SET cash = cash + $1 WHERE user_id = $2 RETURNING cash",
      [amount, userId]
    );
    const newBalance = Number(res.rows[0].cash);
    await client.query(
      "INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after) VALUES ($1, $2, 'DEPOSIT', $3, $4)",
      [newId(), userId, amount, newBalance]
    );
    await client.query("COMMIT");
    return newBalance;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getWalletHistory(userId) {
  const res = await pool.query(
    "SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30",
    [userId]
  );
  return res.rows.map((t) => ({
    id: t.id,
    type: t.type,
    amount: Number(t.amount),
    balanceAfter: Number(t.balance_after),
    createdAt: t.created_at,
  }));
}

// side: "BUY" | "SELL", orderType: "MARKET" | "LIMIT"
export async function placeOrder(userId, { symbol, side, qty, orderType, price, ltp }) {
  if (!["BUY", "SELL"].includes(side)) throw new Error("Invalid order side");
  if (!["MARKET", "LIMIT"].includes(orderType)) throw new Error("Invalid order type");
  qty = Number(qty);
  if (!qty || qty <= 0) throw new Error("Quantity must be greater than zero");
  if (orderType === "LIMIT" && (!price || price <= 0)) {
    throw new Error("Limit orders need a valid price");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const id = newId();
    const isMarket = orderType === "MARKET";

    if (isMarket) {
      await fillOrder(client, userId, { id, symbol, side, qty, fillPrice: ltp });
      await client.query(
        `INSERT INTO orders (id, user_id, symbol, side, qty, order_type, limit_price, status, filled_price, filled_at)
         VALUES ($1,$2,$3,$4,$5,'MARKET',NULL,'FILLED',$6, now())`,
        [id, userId, symbol, side, qty, ltp]
      );
    } else {
      // Validate the order is plausible before parking it OPEN.
      if (side === "BUY") {
        const walletRes = await client.query("SELECT cash FROM wallets WHERE user_id = $1", [userId]);
        if (Number(walletRes.rows[0].cash) < qty * price) {
          throw new Error("Insufficient funds for this limit order");
        }
      } else {
        const holdRes = await client.query(
          "SELECT qty FROM holdings WHERE user_id = $1 AND symbol = $2",
          [userId, symbol]
        );
        if (!holdRes.rows[0] || Number(holdRes.rows[0].qty) < qty) {
          throw new Error("Insufficient holdings to sell");
        }
      }
      await client.query(
        `INSERT INTO orders (id, user_id, symbol, side, qty, order_type, limit_price, status)
         VALUES ($1,$2,$3,$4,$5,'LIMIT',$6,'OPEN')`,
        [id, userId, symbol, side, qty, price]
      );
    }

    await client.query("COMMIT");
    const orderRes = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);
    return mapOrder(orderRes.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Applies a fill to wallet + holdings. Caller manages the transaction.
async function fillOrder(client, userId, { symbol, side, qty, fillPrice }) {
  const cost = qty * fillPrice;

  if (side === "BUY") {
    const walletRes = await client.query(
      "SELECT cash FROM wallets WHERE user_id = $1 FOR UPDATE",
      [userId]
    );
    if (Number(walletRes.rows[0].cash) < cost) throw new Error("Insufficient funds for this order");

    await client.query("UPDATE wallets SET cash = cash - $1 WHERE user_id = $2", [cost, userId]);

    const holdRes = await client.query(
      "SELECT qty, avg_price FROM holdings WHERE user_id = $1 AND symbol = $2 FOR UPDATE",
      [userId, symbol]
    );
    if (holdRes.rows[0]) {
      const existingQty = Number(holdRes.rows[0].qty);
      const existingAvg = Number(holdRes.rows[0].avg_price);
      const newQty = existingQty + qty;
      const newAvg = (existingAvg * existingQty + cost) / newQty;
      await client.query(
        "UPDATE holdings SET qty = $1, avg_price = $2 WHERE user_id = $3 AND symbol = $4",
        [newQty, newAvg, userId, symbol]
      );
    } else {
      await client.query(
        "INSERT INTO holdings (user_id, symbol, qty, avg_price) VALUES ($1,$2,$3,$4)",
        [userId, symbol, qty, fillPrice]
      );
    }
  } else {
    const holdRes = await client.query(
      "SELECT qty FROM holdings WHERE user_id = $1 AND symbol = $2 FOR UPDATE",
      [userId, symbol]
    );
    const existingQty = Number(holdRes.rows[0]?.qty ?? 0);
    if (existingQty < qty) throw new Error("Insufficient holdings to sell");

    const remaining = existingQty - qty;
    if (remaining === 0) {
      await client.query("DELETE FROM holdings WHERE user_id = $1 AND symbol = $2", [userId, symbol]);
    } else {
      await client.query(
        "UPDATE holdings SET qty = $1 WHERE user_id = $2 AND symbol = $3",
        [remaining, userId, symbol]
      );
    }
    await client.query("UPDATE wallets SET cash = cash + $1 WHERE user_id = $2", [cost, userId]);
  }
}

// Called on every live price tick from server.js so pending limit
// orders fill the moment the market reaches their price.
export async function checkLimitOrders(symbol, ltp) {
  const openRes = await pool.query(
    "SELECT * FROM orders WHERE status = 'OPEN' AND symbol = $1",
    [symbol]
  );

  for (const o of openRes.rows) {
    const limitPrice = Number(o.limit_price);
    const crossed =
      (o.side === "BUY" && ltp <= limitPrice) || (o.side === "SELL" && ltp >= limitPrice);
    if (!crossed) continue;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await fillOrder(client, o.user_id, {
        symbol: o.symbol,
        side: o.side,
        qty: Number(o.qty),
        fillPrice: limitPrice,
      });
      await client.query(
        "UPDATE orders SET status = 'FILLED', filled_price = $1, filled_at = now() WHERE id = $2",
        [limitPrice, o.id]
      );
      await client.query("COMMIT");
    } catch {
      await client.query("ROLLBACK");
      await pool.query("UPDATE orders SET status = 'REJECTED' WHERE id = $1", [o.id]);
    } finally {
      client.release();
    }
  }
}

export async function cancelOrder(userId, orderId) {
  const res = await pool.query(
    "UPDATE orders SET status = 'CANCELLED' WHERE id = $1 AND user_id = $2 AND status = 'OPEN' RETURNING *",
    [orderId, userId]
  );
  if (!res.rows[0]) throw new Error("Order not found or already settled");
  return mapOrder(res.rows[0]);
}
