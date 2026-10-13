"use strict";

const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "..", "webapp", "localService", "media");

function crc32(buffer) {
	let crc = ~0;
	for (let i = 0; i < buffer.length; i++) {
		crc ^= buffer[i];
		for (let bit = 0; bit < 8; bit++) {
			crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
		}
	}
	return ~crc >>> 0;
}

function zipStore(files) {
	const parts = [];
	const central = [];
	let offset = 0;
	files.forEach(function (file) {
		const name = Buffer.from(file.name);
		const data = Buffer.from(file.data);
		const crc = crc32(data);
		const local = Buffer.alloc(30 + name.length);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0, 6);
		local.writeUInt16LE(0, 8);
		local.writeUInt16LE(0, 10);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(data.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(name.length, 26);
		name.copy(local, 30);
		parts.push(local, data);
		const entry = Buffer.alloc(46 + name.length);
		entry.writeUInt32LE(0x02014b50, 0);
		entry.writeUInt16LE(20, 4);
		entry.writeUInt16LE(20, 6);
		entry.writeUInt16LE(0, 10);
		entry.writeUInt32LE(crc, 16);
		entry.writeUInt32LE(data.length, 20);
		entry.writeUInt32LE(data.length, 24);
		entry.writeUInt16LE(name.length, 28);
		entry.writeUInt32LE(offset, 42);
		name.copy(entry, 46);
		central.push(entry);
		offset += local.length + data.length;
	});
	const centralBuf = Buffer.concat(central);
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(files.length, 8);
	eocd.writeUInt16LE(files.length, 10);
	eocd.writeUInt32LE(centralBuf.length, 12);
	eocd.writeUInt32LE(offset, 16);
	return Buffer.concat(parts.concat([centralBuf, eocd]));
}

function pdf(lines) {
	const stream = lines.map(function (line, index) {
		const text = String(line).replace(/[()\\]/g, "\\$&");
		return "BT /F1 16 Tf 64 " + (740 - index * 28) + " Td (" + text + ") Tj ET";
	}).join("\n");
	const objects = [
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
		"<< /Length " + Buffer.byteLength(stream) + " >>\nstream\n" + stream + "\nendstream",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
	];
	let body = "%PDF-1.4\n";
	const offsets = [0];
	objects.forEach(function (object, index) {
		offsets.push(Buffer.byteLength(body));
		body += (index + 1) + " 0 obj\n" + object + "\nendobj\n";
	});
	const xref = Buffer.byteLength(body);
	let table = "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
	for (let i = 1; i < offsets.length; i++) {
		table += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
	}
	body += table + "trailer << /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
	return Buffer.from(body);
}

function docx(paragraphs) {
	const body = paragraphs.map(function (text) {
		return "<w:p><w:r><w:t>" + text.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</w:t></w:r></w:p>";
	}).join("");
	return zipStore([
		{
			name: "[Content_Types].xml",
			data: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
				"<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
				"<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>" +
				"<Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
				"<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>" +
				"</Types>"
		},
		{
			name: "_rels/.rels",
			data: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
				"<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
				"<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/>" +
				"</Relationships>"
		},
		{
			name: "word/document.xml",
			data: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
				"<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>" +
				body +
				"</w:body></w:document>"
		}
	]);
}

function cell(ref, value) {
	return "<c r=\"" + ref + "\" t=\"inlineStr\"><is><t>" + String(value).replace(/&/g, "&amp;") + "</t></is></c>";
}

function xlsx(rows) {
	const sheet = rows.map(function (row, rowIndex) {
		const cells = row.map(function (value, columnIndex) {
			return cell(String.fromCharCode(65 + columnIndex) + (rowIndex + 1), value);
		}).join("");
		return "<row r=\"" + (rowIndex + 1) + "\">" + cells + "</row>";
	}).join("");
	return zipStore([
		{
			name: "[Content_Types].xml",
			data: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
				"<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
				"<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>" +
				"<Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
				"<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>" +
				"<Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>" +
				"</Types>"
		},
		{
			name: "_rels/.rels",
			data: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
				"<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
				"<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/>" +
				"</Relationships>"
		},
		{
			name: "xl/workbook.xml",
			data: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
				"<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">" +
				"<sheets><sheet name=\"Price list\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>"
		},
		{
			name: "xl/_rels/workbook.xml.rels",
			data: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
				"<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
				"<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/>" +
				"</Relationships>"
		},
		{
			name: "xl/worksheets/sheet1.xml",
			data: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
				"<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>" +
				sheet +
				"</sheetData></worksheet>"
		}
	]);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "helvetia-supply-agreement.pdf"), pdf([
	"Helvetia Motion AG",
	"Supply agreement",
	"Registration CHE-114.392.881",
	"Payment terms: 30 days net, CHF",
	"ISO 9001 and ISO 14001 are current.",
	"Valid through 31 December 2027."
]));
fs.writeFileSync(path.join(outDir, "helvetia-quality-terms.docx"), docx([
	"Helvetia Motion AG",
	"Quality terms",
	"Incoming parts are inspected against the drawing and the purchase order.",
	"Non-conforming lots are quarantined and reported within two working days.",
	"The SGS audit of 12 November 2025 closed with no major findings.",
	"These terms stay in force until 31 December 2027."
]));
fs.writeFileSync(path.join(outDir, "helvetia-price-list.xlsx"), xlsx([
	["Item", "Unit", "Price CHF", "Lead time"],
	["Servo housing", "pc", "186.00", "4 weeks"],
	["Drive shaft", "pc", "74.50", "3 weeks"],
	["Sealing kit", "set", "22.90", "1 week"],
	["Mounting plate", "pc", "41.00", "2 weeks"]
]));
console.log("wrote pdf, docx, xlsx");
