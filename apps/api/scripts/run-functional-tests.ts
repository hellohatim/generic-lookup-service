/**
 * Spins up in-memory Mongo + API, writes a temp .xlsx, runs Newman against postman/functional.postman_collection.json
 */
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import http from "http";
import newman from "newman";
import ExcelJS from "exceljs";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { createApp } from "../src/app.js";
import { ensureIndexes } from "../src/database/ensureIndexes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const collectionPath = path.join(root, "postman", "functional.postman_collection.json");

async function buildKvXlsx(filePath: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(["Key", "Value"]);
  ws.addRow(["excel-key", "excel-val"]);
  await wb.xlsx.writeFile(filePath);
}

async function main(): Promise<void> {
  const xlsxPath = path.join(os.tmpdir(), `lookup-func-${Date.now()}.xlsx`);
  await buildKvXlsx(xlsxPath);

  const mongod = await MongoMemoryServer.create();
  const client = new MongoClient(mongod.getUri());
  await client.connect();
  const db = client.db("newman_lookup");
  await ensureIndexes(db);
  const app = createApp(db);

  const server = http.createServer(app);
  const port: number = await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const a = server.address();
      if (a && typeof a === "object") resolve(a.port);
      else reject(new Error("no port"));
    });
    server.on("error", reject);
  });

  const baseUrl = `http://127.0.0.1:${port}/lookup/v1`;

  try {
    await new Promise<void>((resolve, reject) => {
      newman.run(
        {
          collection: JSON.parse(fs.readFileSync(collectionPath, "utf8")),
          envVar: [
            { key: "baseUrl", value: baseUrl },
            { key: "xlsxPath", value: xlsxPath },
          ],
          reporters: ["cli"],
        },
        (err, summary) => {
          if (err) {
            reject(err);
            return;
          }
          const failures = summary?.run.failures?.length ?? 0;
          if (failures > 0) {
            reject(new Error(`Newman: ${failures} failed assertions`));
            return;
          }
          resolve();
        }
      );
    });
    console.log("Functional tests (Newman) passed.");
  } finally {
    server.close();
    await client.close();
    await mongod.stop();
    try {
      fs.unlinkSync(xlsxPath);
    } catch {
      /* ignore */
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
