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

app.listen(3000, () => {
  console.log("Backend running on port 3000");
});
