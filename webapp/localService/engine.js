sap.ui.define([], function () {
	"use strict";

	var SERVICE_ROOT = "/sap/opu/odata4/sap/supplier_registration/srvd/sap/supplierregistration/0001/";
	var REGISTRATION_STREAMS = [
		{ name: "articlesOfIncorporation", suffix: "articles", typeField: "articlesMediaType" },
		{ name: "taxCertificate", suffix: "tax", typeField: "taxMediaType" },
		{ name: "isoCertification", suffix: "iso", typeField: "isoMediaType" },
		{ name: "companyLogo", suffix: "logo", typeField: "logoMediaType" }
	];
	var APPROVAL_STATUSES = [
		{ code: "Draft", name: "Draft" },
		{ code: "UnderReview", name: "Under Review" },
		{ code: "Approved", name: "Approved" },
		{ code: "Rejected", name: "Rejected" }
	];
	var RISK_CLASSIFICATIONS = [
		{ code: "Low", name: "Low" },
		{ code: "Medium", name: "Medium" },
		{ code: "High", name: "High" },
		{ code: "Critical", name: "Critical" }
	];

	function clone(value) {
		return JSON.parse(JSON.stringify(value));
	}

	function jsonHeaders() {
		return {
			"Content-Type": "application/json;odata.metadata=minimal;IEEE754Compatible=true;charset=utf-8",
			"OData-Version": "4.0"
		};
	}

	function textHeaders() {
		return { "Content-Type": "text/plain;charset=utf-8", "OData-Version": "4.0" };
	}

	function xmlHeaders() {
		return { "Content-Type": "application/xml;charset=utf-8", "OData-Version": "4.0" };
	}

	function odataError(status, code, message) {
		var statusText = status === 404 ? "Not Found" : status === 405 ? "Method Not Allowed" : "Bad Request";
		return {
			status: status,
			statusText: statusText,
			headers: jsonHeaders(),
			body: JSON.stringify({ error: { code: code, message: message, target: "" } })
		};
	}

	function tokenize(input) {
		var tokens = [];
		var i = 0;
		while (i < input.length) {
			var ch = input.charAt(i);
			if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
				i++;
				continue;
			}
			if (ch === "(" || ch === ")" || ch === ",") {
				tokens.push({ type: ch, value: ch });
				i++;
				continue;
			}
			if (ch === "'") {
				var text = "";
				i++;
				while (i < input.length) {
					if (input.charAt(i) === "'" && input.charAt(i + 1) === "'") {
						text += "'";
						i += 2;
						continue;
					}
					if (input.charAt(i) === "'") {
						i++;
						break;
					}
					text += input.charAt(i);
					i++;
				}
				tokens.push({ type: "string", value: text });
				continue;
			}
			var start = i;
			while (i < input.length && " \t\n\r(),'".indexOf(input.charAt(i)) === -1) {
				i++;
			}
			tokens.push({ type: "word", value: input.slice(start, i) });
		}
		return tokens;
	}

	function compileFilter(expression) {
		var tokens = tokenize(expression);
		var index = 0;

		function peek() {
			return tokens[index];
		}

		function take() {
			return tokens[index++];
		}

		function coerce(token) {
			if (!token) {
				return null;
			}
			if (token.type === "string") {
				return token.value;
			}
			var value = token.value;
			if (value === "true") {
				return true;
			}
			if (value === "false") {
				return false;
			}
			if (value === "null") {
				return null;
			}
			if (/^-?\d+(\.\d+)?$/.test(value)) {
				return Number(value);
			}
			return value;
		}

		function parseValue() {
			var token = take();
			if (token && token.type === "word" && token.value.toLowerCase() === "tolower") {
				if (peek() && peek().type === "(") {
					take();
				}
				var inner = parseValue();
				if (peek() && peek().type === ")") {
					take();
				}
				return function (row) {
					var value = inner(row);
					return value == null ? "" : String(value).toLowerCase();
				};
			}
			if (token && token.type === "word") {
				var field = token.value;
				return function (row) {
					return row[field];
				};
			}
			var literal = coerce(token);
			return function () {
				return literal;
			};
		}

		function parsePrimary() {
			if (peek() && peek().type === "(") {
				take();
				var grouped = parseOr();
				if (peek() && peek().type === ")") {
					take();
				}
				return grouped;
			}
			var first = take();
			if (!first) {
				return function () {
					return true;
				};
			}
			var word = first.value;
			var fn = word.toLowerCase();
			if (fn === "contains" || fn === "startswith" || fn === "endswith") {
				if (peek() && peek().type === "(") {
					take();
				}
				var haystack = parseValue();
				if (peek() && peek().type === ",") {
					take();
				}
				var needleToken = take();
				if (peek() && peek().type === ")") {
					take();
				}
				var needle = String(coerce(needleToken)).toLowerCase();
				return function (row) {
					var hay = String(haystack(row) == null ? "" : haystack(row)).toLowerCase();
					if (fn === "contains") {
						return hay.indexOf(needle) !== -1;
					}
					if (fn === "startswith") {
						return hay.indexOf(needle) === 0;
					}
					return hay.length >= needle.length && hay.lastIndexOf(needle) === hay.length - needle.length;
				};
			}
			var opToken = take();
			var literalToken = take();
			var op = opToken ? opToken.value.toLowerCase() : "eq";
			var expected = coerce(literalToken);
			return function (row) {
				var actual = row[word];
				if (op === "eq") {
					return actual === expected || String(actual) === String(expected);
				}
				if (op === "ne") {
					return String(actual) !== String(expected);
				}
				if (actual == null || expected == null) {
					return false;
				}
				if (op === "gt") {
					return actual > expected;
				}
				if (op === "ge") {
					return actual >= expected;
				}
				if (op === "lt") {
					return actual < expected;
				}
				if (op === "le") {
					return actual <= expected;
				}
				return false;
			};
		}

		function parseNot() {
			if (peek() && peek().type === "word" && peek().value.toLowerCase() === "not") {
				take();
				var inner = parseNot();
				return function (row) {
					return !inner(row);
				};
			}
			return parsePrimary();
		}

		function parseAnd() {
			var left = parseNot();
			while (peek() && peek().type === "word" && peek().value.toLowerCase() === "and") {
				take();
				var right = parseNot();
				var current = left;
				left = function (row) {
					return current(row) && right(row);
				};
			}
			return left;
		}

		function parseOr() {
			var left = parseAnd();
			while (peek() && peek().type === "word" && peek().value.toLowerCase() === "or") {
				take();
				var right = parseAnd();
				var current = left;
				left = function (row) {
					return current(row) || right(row);
				};
			}
			return left;
		}

		if (!expression || !String(expression).trim()) {
			return function () {
				return true;
			};
		}
		return parseOr();
	}

	function matchesSearch(row, term) {
		if (!term) {
			return true;
		}
		var text = String(term).replace(/^"|"$/g, "").trim().toLowerCase();
		if (!text) {
			return true;
		}
		var blob = Object.keys(row).map(function (key) {
			var value = row[key];
			return value == null || typeof value === "object" ? "" : String(value);
		}).join("\n").toLowerCase();
		return text.split(/\s+/).every(function (word) {
			return blob.indexOf(word) !== -1;
		});
	}

	function parseOrderBy(value) {
		if (!value) {
			return [];
		}
		return value.split(",").map(function (part) {
			var bits = part.trim().split(/\s+/);
			return { field: bits[0], desc: (bits[1] || "").toLowerCase() === "desc" };
		}).filter(function (item) {
			return item.field;
		});
	}

	function sortRows(rows, order) {
		var copy = rows.slice();
		copy.sort(function (a, b) {
			for (var i = 0; i < order.length; i++) {
				var av = a[order[i].field];
				var bv = b[order[i].field];
				if (av === bv) {
					continue;
				}
				if (av == null) {
					return 1;
				}
				if (bv == null) {
					return -1;
				}
				var cmp = String(av) < String(bv) ? -1 : 1;
				return order[i].desc ? -cmp : cmp;
			}
			return 0;
		});
		return copy;
	}

	function queryRows(rows, query, defaultOrder) {
		var predicate = function () {
			return true;
		};
		if (query.$filter) {
			predicate = compileFilter(query.$filter);
		}
		var filtered = rows.filter(function (row) {
			return predicate(row) && matchesSearch(row, query.$search);
		});
		var order = parseOrderBy(query.$orderby);
		if (!order.length && defaultOrder) {
			order = defaultOrder;
		}
		var sorted = sortRows(filtered, order);
		var skip = parseInt(query.$skip || "0", 10);
		if (isNaN(skip) || skip < 0) {
			skip = 0;
		}
		var top = query.$top === undefined || query.$top === "" ? sorted.length : parseInt(query.$top, 10);
		if (isNaN(top) || top < 0) {
			top = sorted.length;
		}
		return { total: sorted.length, rows: sorted.slice(skip, skip + top) };
	}

	function parseQuery(query) {
		var params = {};
		if (!query) {
			return params;
		}
		query.split("&").forEach(function (pair) {
			if (!pair) {
				return;
			}
			var eq = pair.indexOf("=");
			var key = decodeURIComponent(eq >= 0 ? pair.slice(0, eq) : pair);
			var value = eq >= 0 ? pair.slice(eq + 1) : "";
			params[key] = decodeURIComponent(value.replace(/\+/g, " "));
		});
		return params;
	}

	function splitResource(path) {
		var segments = [];
		var i = 0;
		while (i < path.length) {
			if (path.charAt(i) === "/") {
				i++;
				continue;
			}
			var start = i;
			while (i < path.length && path.charAt(i) !== "/" && path.charAt(i) !== "(") {
				i++;
			}
			var name = decodeURIComponent(path.slice(start, i));
			var key = null;
			if (path.charAt(i) === "(") {
				var depth = 0;
				var keyStart = i + 1;
				for (; i < path.length; i++) {
					if (path.charAt(i) === "(") {
						depth++;
					} else if (path.charAt(i) === ")") {
						depth--;
						if (depth === 0) {
							i++;
							break;
						}
					}
				}
				key = path.slice(keyStart, i - 1);
			}
			if (name) {
				segments.push({ name: name, key: key });
			}
		}
		return segments;
	}

	function unquote(value) {
		if (value.length >= 2 && value.charAt(0) === "'" && value.charAt(value.length - 1) === "'") {
			return value.slice(1, -1).replace(/''/g, "'");
		}
		return value;
	}

	function parseKey(raw) {
		if (raw == null) {
			return {};
		}
		var text = decodeURIComponent(raw).trim();
		if (!text) {
			return {};
		}
		if (text.charAt(0) === "'") {
			return { "": unquote(text) };
		}
		var result = {};
		var parts = [];
		var current = "";
		var quoted = false;
		for (var i = 0; i < text.length; i++) {
			var ch = text.charAt(i);
			if (ch === "'" && text.charAt(i + 1) === "'") {
				current += "''";
				i++;
				continue;
			}
			if (ch === "'") {
				quoted = !quoted;
				current += ch;
				continue;
			}
			if (ch === "," && !quoted) {
				parts.push(current);
				current = "";
				continue;
			}
			current += ch;
		}
		if (current) {
			parts.push(current);
		}
		parts.forEach(function (part) {
			var eq = part.indexOf("=");
			if (eq === -1) {
				result[""] = unquote(part.trim());
				return;
			}
			result[part.slice(0, eq).trim()] = unquote(part.slice(eq + 1).trim());
		});
		return result;
	}

	function collectionResponse(context, query, result, mapRow) {
		var payload = {
			"@odata.context": context,
			value: result.rows.map(mapRow)
		};
		if (query.$count === "true") {
			payload["@odata.count"] = result.total;
		}
		return { status: 200, statusText: "OK", headers: jsonHeaders(), body: JSON.stringify(payload) };
	}

	function entityResponse(context, row) {
		row["@odata.context"] = context;
		return { status: 200, statusText: "OK", headers: jsonHeaders(), body: JSON.stringify(row) };
	}

	function copyPublic(row, hidden) {
		var payload = {};
		Object.keys(row).forEach(function (key) {
			if (hidden.indexOf(key) === -1) {
				payload[key] = row[key];
			}
		});
		return payload;
	}

	function serializeRegistration(state, row) {
		var payload = copyPublic(row, ["previewKey"]);
		REGISTRATION_STREAMS.forEach(function (stream) {
			delete payload[stream.name];
			payload[stream.name + "@odata.mediaContentType"] = row[stream.typeField] || "image/png";
			payload[stream.name + "@odata.mediaReadLink"] = state.mediaBase + row.previewKey + "-" + stream.suffix + ".png";
		});
		payload.logoUrl = state.mediaBase + row.previewKey + "-logo.png";
		payload.addressLine = [row.street, [row.postalCode, row.city].filter(Boolean).join(" "), row.country].filter(Boolean).join(", ");
		return payload;
	}

	function fileKindOf(row) {
		var type = String(row.mediaType || "").toLowerCase();
		var name = String(row.fileName || "").toLowerCase();
		if (type.indexOf("pdf") >= 0 || name.slice(-4) === ".pdf") {
			return "pdf";
		}
		if (type.indexOf("wordprocessingml") >= 0 || name.slice(-5) === ".docx") {
			return "docx";
		}
		if (type.indexOf("msword") >= 0 || name.slice(-4) === ".doc") {
			return "doc";
		}
		if (type.indexOf("spreadsheetml") >= 0 || name.slice(-5) === ".xlsx") {
			return "xlsx";
		}
		if (type.indexOf("ms-excel") >= 0 || name.slice(-4) === ".xls") {
			return "xls";
		}
		if (type.indexOf("image/") === 0 || /\.(png|jpe?g|gif|webp|bmp)$/.test(name)) {
			return "image";
		}
		return "file";
	}

	var FORMAT_LABELS = { pdf: "PDF", doc: "Word", docx: "Word", xls: "Excel", xlsx: "Excel", image: "Image", file: "File" };

	function serializeDocument(state, row) {
		var payload = copyPublic(row, ["previewFile", "blobUrl", "contentBase64", "bytes"]);
		var kind = fileKindOf(row);
		delete payload.content;
		payload.fileKind = kind;
		payload.formatLabel = FORMAT_LABELS[kind] || "File";
		payload["content@odata.mediaContentType"] = row.mediaType || "application/octet-stream";
		payload["content@odata.mediaReadLink"] = row.bytes
			? state.serviceRoot + "SupplierDocuments('" + row.ID + "')/content"
			: state.mediaBase + row.previewFile;
		return payload;
	}

	function decodeBase64(value) {
		var binary = atob(value || "");
		var bytes = new Uint8Array(binary.length);
		for (var i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	}

	function addUploadedDocument(state, registration, body) {
		var data;
		try {
			data = JSON.parse(body || "{}");
		} catch (error) {
			return odataError(400, "BAD_REQUEST", "Upload body must be JSON.");
		}
		var kind = fileKindOf(data);
		if (kind !== "pdf" && kind !== "doc" && kind !== "docx" && kind !== "xls" && kind !== "xlsx" && kind !== "image") {
			return odataError(415, "UNSUPPORTED", "Upload an image, Word, Excel, or PDF file.");
		}
		if (!data.contentBase64) {
			return odataError(400, "BAD_REQUEST", "The file content is missing.");
		}
		state.uploadSeq = (state.uploadSeq || 0) + 1;
		var row = {
			ID: "DOC-U" + state.uploadSeq,
			registrationId: registration.ID,
			documentType: data.documentType || "Uploaded file",
			fileName: data.fileName || ("upload." + kind),
			mediaType: data.mediaType || "application/octet-stream",
			validUntil: null,
			previewFile: "",
			bytes: decodeBase64(data.contentBase64)
		};
		state.documents.push(row);
		return entityResponse("$metadata#SupplierDocuments/$entity", serializeDocument(state, row));
	}

	function documentsOf(state, registrationId) {
		return state.documents.filter(function (document) {
			return document.registrationId === registrationId;
		});
	}

	function findById(rows, key) {
		var id = key.ID || key[""];
		for (var i = 0; i < rows.length; i++) {
			if (rows[i].ID === id) {
				return rows[i];
			}
		}
		return null;
	}

	function headerValue(headers, name) {
		var found = Object.keys(headers || {}).filter(function (key) {
			return key.toLowerCase() === name;
		})[0];
		return found ? headers[found] : "";
	}

	function boundaryOf(contentType) {
		var match = /boundary="?([^";]+)"?/i.exec(contentType || "");
		return match ? match[1] : "";
	}

	function splitParts(body, boundary) {
		var marker = "--" + boundary;
		var chunks = String(body).split(marker);
		var parts = [];
		for (var i = 1; i < chunks.length; i++) {
			var chunk = chunks[i];
			if (chunk.indexOf("--") === 0) {
				continue;
			}
			parts.push(chunk.replace(/^\r?\n/, ""));
		}
		return parts;
	}

	function parseHeaders(block) {
		var headers = {};
		String(block || "").split(/\r?\n/).forEach(function (line) {
			var idx = line.indexOf(":");
			if (idx > 0) {
				headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
			}
		});
		return headers;
	}

	function parseHttpRequest(http) {
		var sep = http.indexOf("\r\n\r\n");
		var sepLen = 4;
		if (sep < 0) {
			sep = http.indexOf("\n\n");
			sepLen = 2;
		}
		var head = sep < 0 ? http : http.slice(0, sep);
		var payload = sep < 0 ? "" : http.slice(sep + sepLen).replace(/\r?\n$/, "");
		var lines = head.split(/\r?\n/);
		var request = /^(\w+)\s+(\S+)\s+HTTP/i.exec(lines[0] || "");
		return {
			method: request ? request[1].toUpperCase() : "GET",
			url: request ? request[2] : "",
			headers: parseHeaders(lines.slice(1).join("\n")),
			body: payload
		};
	}

	function parseMimePart(text) {
		var sep = text.indexOf("\r\n\r\n");
		var sepLen = 4;
		if (sep < 0) {
			sep = text.indexOf("\n\n");
			sepLen = 2;
		}
		var mime = sep < 0 ? text : text.slice(0, sep);
		var rest = sep < 0 ? "" : text.slice(sep + sepLen);
		var headers = parseHeaders(mime);
		var contentType = headerValue(headers, "content-type");
		if (contentType.toLowerCase().indexOf("multipart/mixed") === 0) {
			return {
				changeset: true,
				contentId: headerValue(headers, "content-id"),
				parts: parseBatch(rest, contentType)
			};
		}
		return {
			changeset: false,
			contentId: headerValue(headers, "content-id"),
			request: parseHttpRequest(rest)
		};
	}

	function parseBatch(body, contentType) {
		var boundary = boundaryOf(contentType);
		if (!boundary) {
			throw new Error("Missing $batch boundary");
		}
		return splitParts(body, boundary).map(parseMimePart);
	}

	function httpPart(response, contentId) {
		var lines = ["Content-Type: application/http", "Content-Transfer-Encoding: binary"];
		if (contentId) {
			lines.push("Content-ID: " + contentId);
		}
		lines.push("");
		var statusLine = "HTTP/1.1 " + response.status + " " + (response.statusText || "OK");
		var headerLines = Object.keys(response.headers || {}).map(function (key) {
			return key + ": " + response.headers[key];
		});
		lines.push([statusLine].concat(headerLines).join("\r\n") + "\r\n\r\n" + (response.body || ""));
		return lines.join("\r\n");
	}

	function serializeBatch(responses) {
		var boundary = "batchresp_" + Math.random().toString(16).slice(2);
		var chunks = [];
		responses.forEach(function (response) {
			chunks.push("--" + boundary);
			if (response.changeset) {
				var changeBoundary = "changesetresp_" + Math.random().toString(16).slice(2);
				chunks.push("Content-Type: multipart/mixed; boundary=" + changeBoundary);
				chunks.push("");
				response.parts.forEach(function (part) {
					chunks.push("--" + changeBoundary);
					chunks.push(httpPart(part.response, part.contentId || "0.0"));
				});
				chunks.push("--" + changeBoundary + "--");
			} else {
				chunks.push(httpPart(response.response));
			}
		});
		chunks.push("--" + boundary + "--");
		return {
			contentType: "multipart/mixed; boundary=" + boundary,
			body: chunks.join("\r\n")
		};
	}

	function handleEntity(state, segments, method, query, body) {
		var count = segments.length > 1 && segments[segments.length - 1].name === "$count";
		var resource = count ? segments.slice(0, -1) : segments;
		var root = resource[0];
		var nav = resource.length > 1 ? resource[1] : null;
		if (method === "POST" && root && root.name === "SupplierRegistrations" && root.key && nav && nav.name === "documents" && !nav.key) {
			var registrationForUpload = findById(state.registrations, parseKey(root.key));
			if (!registrationForUpload) {
				return odataError(404, "NOT_FOUND", "Supplier registration was not found.");
			}
			return addUploadedDocument(state, registrationForUpload, body);
		}
		if (method !== "GET" && method !== "HEAD") {
			return odataError(405, "NOT_ALLOWED", "This demo only accepts document uploads.");
		}

		if (root.name === "ApprovalStatuses") {
			var statuses = queryRows(APPROVAL_STATUSES, query, [{ field: "name", desc: false }]);
			if (count) {
				return { status: 200, statusText: "OK", headers: textHeaders(), body: String(statuses.total) };
			}
			return collectionResponse("$metadata#ApprovalStatuses", query, statuses, function (row) {
				return clone(row);
			});
		}
		if (root.name === "RiskClassifications") {
			var risks = queryRows(RISK_CLASSIFICATIONS, query, [{ field: "name", desc: false }]);
			if (count) {
				return { status: 200, statusText: "OK", headers: textHeaders(), body: String(risks.total) };
			}
			return collectionResponse("$metadata#RiskClassifications", query, risks, function (row) {
				return clone(row);
			});
		}

		if (root.name === "SupplierRegistrations" && !root.key) {
			var listed = queryRows(state.registrations, query, [{ field: "companyName", desc: false }]);
			if (count) {
				return { status: 200, statusText: "OK", headers: textHeaders(), body: String(listed.total) };
			}
			return collectionResponse("$metadata#SupplierRegistrations", query, listed, function (row) {
				return serializeRegistration(state, row);
			});
		}

		if (root.name === "SupplierRegistrations" && root.key) {
			var registration = findById(state.registrations, parseKey(root.key));
			if (!registration) {
				return odataError(404, "NOT_FOUND", "Supplier registration was not found.");
			}
			if (nav && nav.name === "documents") {
				var owned = documentsOf(state, registration.ID);
				if (nav.key) {
					var oneDoc = findById(owned, parseKey(nav.key));
					if (!oneDoc) {
						return odataError(404, "NOT_FOUND", "Document was not found.");
					}
					return entityResponse("$metadata#SupplierDocuments/$entity", serializeDocument(state, oneDoc));
				}
				var docs = queryRows(owned, query, [{ field: "documentType", desc: false }]);
				if (count) {
					return { status: 200, statusText: "OK", headers: textHeaders(), body: String(docs.total) };
				}
				return collectionResponse("$metadata#SupplierDocuments", query, docs, function (row) {
					return serializeDocument(state, row);
				});
			}
			var payload = serializeRegistration(state, registration);
			if (query.$expand && query.$expand.indexOf("documents") !== -1) {
				payload.documents = documentsOf(state, registration.ID).map(function (row) {
					return serializeDocument(state, row);
				});
			}
			return entityResponse("$metadata#SupplierRegistrations/$entity", payload);
		}

		if (root.name === "SupplierDocuments") {
			if (root.key && nav && nav.name === "content") {
				var stored = findById(state.documents, parseKey(root.key));
				if (!stored || !stored.bytes) {
					return odataError(404, "NOT_FOUND", "File content was not found.");
				}
				return {
					status: 200,
					statusText: "OK",
					headers: {
						"Content-Type": stored.mediaType || "application/octet-stream",
						"OData-Version": "4.0"
					},
					body: stored.bytes
				};
			}
			if (root.key) {
				var document = findById(state.documents, parseKey(root.key));
				if (!document) {
					return odataError(404, "NOT_FOUND", "Document was not found.");
				}
				return entityResponse("$metadata#SupplierDocuments/$entity", serializeDocument(state, document));
			}
			var allDocs = queryRows(state.documents, query, [{ field: "documentType", desc: false }]);
			if (count) {
				return { status: 200, statusText: "OK", headers: textHeaders(), body: String(allDocs.total) };
			}
			return collectionResponse("$metadata#SupplierDocuments", query, allDocs, function (row) {
				return serializeDocument(state, row);
			});
		}

		return odataError(404, "NOT_FOUND", "Resource " + root.name + " was not found.");
	}

	function createEngine(options) {
		var state = {
			metadataXml: options.metadataXml || "",
			registrations: clone(options.registrations || []),
			documents: clone(options.documents || []),
			mediaBase: options.mediaBase || "",
			serviceRoot: options.serviceRoot || SERVICE_ROOT
		};

		function normalizeUrl(url) {
			var text = String(url || "");
			var hash = text.indexOf("#");
			if (hash >= 0) {
				text = text.slice(0, hash);
			}
			var queryIndex = text.indexOf("?");
			var path = queryIndex >= 0 ? text.slice(0, queryIndex) : text;
			var query = queryIndex >= 0 ? text.slice(queryIndex + 1) : "";
			var at = path.indexOf(state.serviceRoot);
			if (at >= 0) {
				path = path.slice(at + state.serviceRoot.length);
			}
			path = path.replace(/^\/+/, "");
			try {
				path = decodeURI(path);
			} catch (error) {
				// Keep the raw path when a sequence is not valid URI encoding.
			}
			return { path: path, query: parseQuery(query) };
		}

		function dispatch(method, url, body) {
			var target = normalizeUrl(url);
			if (!target.path || target.path === "/") {
				return {
					status: 200,
					statusText: "OK",
					headers: jsonHeaders(),
					body: JSON.stringify({
						"@odata.context": "$metadata",
						value: [
							{ name: "SupplierRegistrations", kind: "EntitySet", url: "SupplierRegistrations" },
							{ name: "SupplierDocuments", kind: "EntitySet", url: "SupplierDocuments" },
							{ name: "ApprovalStatuses", kind: "EntitySet", url: "ApprovalStatuses" },
							{ name: "RiskClassifications", kind: "EntitySet", url: "RiskClassifications" }
						]
					})
				};
			}
			if (target.path === "$metadata") {
				return {
					status: 200,
					statusText: "OK",
					headers: xmlHeaders(),
					body: method === "HEAD" ? "" : state.metadataXml
				};
			}
			return handleEntity(state, splitResource(target.path), method, target.query, body);
		}

		return {
			serviceRoot: state.serviceRoot,
			handle: function (method, url, body, headers) {
				var verb = String(method || "GET").toUpperCase();
				if (normalizeUrl(url).path === "$batch") {
					if (verb !== "POST") {
						return odataError(405, "NOT_ALLOWED", "$batch must be posted.");
					}
					var parts = parseBatch(body || "", headerValue(headers || {}, "content-type"));
					var responses = parts.map(function (part) {
						if (part.changeset) {
							return {
								changeset: true,
								parts: part.parts.map(function (inner, innerIndex) {
									return {
										contentId: inner.contentId || (innerIndex + ".0"),
										response: dispatch(inner.request.method, inner.request.url)
									};
								})
							};
						}
						return {
							changeset: false,
							response: dispatch(part.request.method, part.request.url)
						};
					});
					var batch = serializeBatch(responses);
					return {
						status: 200,
						statusText: "OK",
						headers: { "Content-Type": batch.contentType, "OData-Version": "4.0" },
						body: batch.body
					};
				}
				return dispatch(verb, url, body);
			}
		};
	}

	return {
		SERVICE_ROOT: SERVICE_ROOT,
		createEngine: createEngine
	};
});
