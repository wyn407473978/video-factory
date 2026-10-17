import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const projectDir = "/Users/rise/project/UI-Design/mbti-ios-app-ui-design/xingge-video-studio";
const outputDir = path.join(projectDir, "public", "templates");
const previewDir = path.join(projectDir, "tmp", "template-preview");
const outputPath = path.join(outputDir, "星格文案批量导入模板.xlsx");
const previewPath = path.join(previewDir, "星格文案批量导入模板.png");

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("文案导入");
sheet.showGridLines = false;
sheet.tabColor = "#FF7E90";
sheet.freezePanes.freezeRows(1);

sheet.getRange("A1:C1").values = [["视频标题", "内容标签", "正文内容"]];
sheet.getRange("A1:C1").format = {
  fill: "#24213A",
  font: { bold: true, color: "#FFFFFF", size: 12 },
  rowHeight: 32,
  verticalAlignment: "center",
  horizontalAlignment: "center",
  borders: { preset: "all", style: "thin", color: "#655B82" }
};

const inputRange = sheet.getRange("A2:C501");
inputRange.format = {
  fill: "#FBF9FC",
  font: { color: "#282431", size: 11 },
  rowHeight: 34,
  verticalAlignment: "center",
  wrapText: true,
  borders: { preset: "all", style: "thin", color: "#E8E2EA" }
};
sheet.getRange("A2:A501").format.columnWidth = 30;
sheet.getRange("B2:B501").format.columnWidth = 22;
sheet.getRange("C2:C501").format.columnWidth = 72;
sheet.getRange("A2:C501").setNumberFormat("@");

await workbook.recalculate();

const inspection = await workbook.inspect({
  kind: "region",
  sheetId: "文案导入",
  range: "A1:C5",
  maxChars: 3000
});
console.log(inspection.ndjson);

const preview = await workbook.render({
  sheetName: "文案导入",
  range: "A1:C8",
  scale: 1.3,
  format: "png"
});

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

const exportedBlob = await FileBlob.load(outputPath);
const verifiedWorkbook = await SpreadsheetFile.importXlsx(exportedBlob);
const verifiedSheet = verifiedWorkbook.worksheets.getItem("文案导入");
const verifiedValues = verifiedSheet.getRange("A1:C5").values;
const spreadsheetErrors = verifiedValues.flat().filter((value) => /^#(?:REF|DIV\/0|VALUE|NAME\?|N\/A)!?$/u.test(String(value || "")));

console.log(JSON.stringify({ outputPath, previewPath, verifiedValues, spreadsheetErrors }));
