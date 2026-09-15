import { useEffect, useRef } from "react";
import { WS_URL } from "./api";

// Subscribes to the live feed once and fans updates out to a callback.
// onUpdate receives { type: 'tick'|'candle_new', symbol, candle }
export function useLiveFeed(onUpdate) {
  const cbRef = useRef(onUpdate);
  cbRef.current = onUpdate;

  useEffect(() => {
    let ws;
    let closedByUs = false;
    let retryDelay = 1000;

    function connect() {
      ws = new WebSocket(WS_URL);
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "tick" || data.type === "candle_new") {
          cbRef.current(data);
        }
      };
      ws.onclose = () => {
        if (!closedByUs) {
          setTimeout(connect, retryDelay);
          retryDelay = Math.min(retryDelay * 1.5, 8000);
        }
      };
    }

    connect();
    return () => {
      closedByUs = true;
      ws && ws.close();
    };
  }, []);
}
