import express from "express";
import cors from "cors";
import sensors from "./routes/sensors.js";
import control from "./routes/control.js";
import system from "./routes/system.js";
import auth from "./routes/auth.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/sensors", sensors);
app.use("/api/control", control);
app.use("/api/system", system);
app.use("/api/auth", auth);

app.get("/", (req, res) => {
  res.send("Smart Aquarium Backend is running!");
});

// Export the Express API
export default app;

// Only listen if this file is run directly (not imported as a library/module)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
  });
}
