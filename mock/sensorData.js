export let latestSensorData = {
  temperature: 28.6,
  lux: 340,
  water_level: 82, // Percentage
  pump_status: "OFF",
  feeding: {
    last_fed: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
    next_feeding: new Date(Date.now() + 1000 * 60 * 60 * 2).toISOString(), // in 2 hours
    interval: "4h",
    quantity: 1
  },
  last_updated: new Date().toISOString()
};

export let sensorHistory = [
  {
    temperature: 27.8,
    lux: 300,
    water_level: 80,
    created_at: "2025-01-20T10:30:00Z"
  }
];
