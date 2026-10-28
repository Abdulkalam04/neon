import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import { getRouter } from "../router";
import "../styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error('Missing app root element with id "root".');
}

createRoot(rootElement).render(<RouterProvider router={getRouter()} />);
