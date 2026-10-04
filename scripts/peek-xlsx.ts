import fs from "fs";
import XLSX from "xlsx";

const p =
  process.argv[2] ||
  "E:/group_zzz吹水群_869747866_20260803_194947077.xlsx";

if (!fs.existsSync(p)) {
  console.log("MISSING", p);
  process.exit(1);
}
const wb = XLSX.readFile(p, { sheetRows: 8 });
console.log("sheets", wb.SheetNames);
const sh = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sh, {
  defval: "",
});
console.log("keys", rows[0] ? Object.keys(rows[0]) : []);
console.log(JSON.stringify(rows.slice(0, 3), null, 2));
