"use strict";

// A stand-in Home Assistant for the bridge checks: serves /api/states and
// records every service call so a test can assert what a tile tap did.

const http = require("http");

const TOKEN = "test-token";

function defaultStates() {
  return [
    {
      entity_id: "light.kitchen",
      state: "on",
      attributes: { friendly_name: "Kitchen", brightness: 128 },
    },
    {
      entity_id: "switch.desk_lamp",
      state: "off",
      attributes: { friendly_name: "Desk Lamp" },
    },
    {
      entity_id: "sensor.living_room_temperature",
      state: "21.437",
      attributes: { friendly_name: "Living Room Temperature", unit_of_measurement: "°C" },
    },
    {
      entity_id: "scene.movie_night",
      state: "unknown",
      attributes: { friendly_name: "Movie Night" },
    },
    {
      entity_id: "lock.front_door",
      state: "locked",
      attributes: { friendly_name: "Front Door" },
    },
  ];
}

function start() {
  const calls = [];
  let states = defaultStates();

  const server = http.createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401).end("unauthorized");
      return;
    }
    if (req.method === "GET" && req.url === "/api/states") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(states));
      return;
    }
    const match = req.method === "POST" && req.url.match(/^\/api\/services\/([^/]+)\/([^/]+)$/);
    if (match) {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        calls.push({ domain: match[1], service: match[2], data: body ? JSON.parse(body) : {} });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("[]");
      });
      return;
    }
    res.writeHead(404).end("not found");
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        server,
        calls,
        token: TOKEN,
        url: `http://127.0.0.1:${server.address().port}`,
        setStates(next) {
          states = next;
        },
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

module.exports = { start, defaultStates, TOKEN };
