"use strict";

const fs = require("fs");
const path = require("path");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendFile(res, file) {
  let body;
  try {
    body = fs.readFileSync(file);
  } catch {
    sendText(res, 404, "Not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": CONTENT_TYPES[path.extname(file)] || "application/octet-stream",
    "Content-Length": body.length,
    // The setup page is edited live during a prototype session; never cache it.
    "Cache-Control": "no-store",
  });
  res.end(body);
}

module.exports = { sendJson, sendText, sendFile };
