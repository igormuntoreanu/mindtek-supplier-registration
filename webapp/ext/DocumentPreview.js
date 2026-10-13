sap.ui.define([
	"sap/m/MessageToast",
	"sap/ui/core/HTML",
	"sap/m/Image",
	"sap/m/ScrollContainer",
	"sap/m/Table",
	"sap/m/Column",
	"sap/m/ColumnListItem",
	"sap/m/Text",
	"sap/m/IllustratedMessage",
	"sap/ui/model/json/JSONModel"
], function (MessageToast, HTML, Image, ScrollContainer, Table, Column, ColumnListItem, Text, IllustratedMessage, JSONModel) {
	"use strict";

	var scripts = {};

	function loadScript(url, globalName) {
		if (window[globalName]) {
			return Promise.resolve(window[globalName]);
		}
		if (!scripts[url]) {
			scripts[url] = new Promise(function (resolve, reject) {
				var script = document.createElement("script");
				script.src = url;
				script.onload = function () {
					resolve(window[globalName]);
				};
				script.onerror = function () {
					reject(new Error("Failed to load " + url));
				};
				document.head.appendChild(script);
			});
		}
		return scripts[url];
	}

	function find(view, suffix) {
		if (!view || !view.findAggregatedObjects) {
			return null;
		}
		var found = null;
		view.findAggregatedObjects(true).some(function (control) {
			if (control.getId && control.getId().slice(-suffix.length) === suffix) {
				found = control;
				return true;
			}
			return false;
		});
		return found;
	}

	function findTable(view) {
		var found = null;
		view.findAggregatedObjects(true).some(function (control) {
			var id = control.getId ? control.getId() : "";
			if (id.indexOf("documents::LineItem") >= 0 && control.isA && control.isA("sap.m.Table")) {
				found = control;
				return true;
			}
			return false;
		});
		return found;
	}

	function viewOf(control) {
		var current = control;
		while (current) {
			if (current.isA && current.isA("sap.ui.core.mvc.View")) {
				return current;
			}
			if (current.getView) {
				var view = current.getView();
				if (view) {
					return view;
				}
			}
			current = current.getParent && current.getParent();
		}
		return null;
	}

	function clearHost(host) {
		host.removeAllItems();
		host.destroyItems();
	}

	function showMessage(host, title, description) {
		clearHost(host);
		host.addItem(new IllustratedMessage({
			illustrationType: "sapIllus-UnableToLoad",
			title: title,
			description: description
		}));
	}

	function asObjectUrl(url) {
		if (url.indexOf("blob:") === 0 || url.indexOf("data:") === 0) {
			return Promise.resolve(url);
		}
		return fetch(url).then(function (response) {
			if (!response.ok) {
				throw new Error(String(response.status));
			}
			return response.blob();
		}).then(function (blob) {
			return URL.createObjectURL(blob);
		});
	}

	function showPdf(host, url, title) {
		return fetch(url).then(function (response) {
			if (!response.ok) {
				throw new Error(String(response.status));
			}
			return response.arrayBuffer();
		}).then(function (buffer) {
			return loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", "pdfjsLib").then(function (pdfjsLib) {
				pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
				return pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
			});
		}).then(function (pdf) {
			clearHost(host);
			var pages = new HTML({
				sanitizeContent: false,
				content: "<div class=\"supplierPdfPages\"></div>"
			});
			host.addItem(new ScrollContainer({
				height: "32rem",
				width: "100%",
				vertical: true,
				content: [pages]
			}));
			var draw = function () {
				var root = pages.getDomRef();
				var target = root && (root.querySelector(".supplierPdfPages") || root);
				if (!target || target.dataset.drawn === "1") {
					return;
				}
				target.dataset.drawn = "1";
				drawPdfPages(pdf, target, title);
			};
			pages.addEventDelegate({ onAfterRendering: draw });
			draw();
		});
	}

	function drawPdfPages(pdf, root, title) {
		var width = Math.max((root.clientWidth || 720) - 32, 320);
		var sequence = Promise.resolve();
		var enqueue = function (pageNumber) {
			sequence = sequence.then(function () {
				return pdf.getPage(pageNumber).then(function (page) {
					var base = page.getViewport({ scale: 1 });
					var viewport = page.getViewport({ scale: Math.min(1.5, width / base.width) });
					var canvas = document.createElement("canvas");
					canvas.width = Math.floor(viewport.width);
					canvas.height = Math.floor(viewport.height);
					canvas.className = "supplierPdfPage";
					canvas.setAttribute("role", "img");
					canvas.setAttribute("aria-label", title);
					root.appendChild(canvas);
					return page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;
				});
			});
		};
		for (var number = 1; number <= pdf.numPages; number++) {
			enqueue(number);
		}
	}

	function showImage(host, url, title) {
		clearHost(host);
		host.addItem(new Image({
			src: url,
			alt: title,
			width: "100%",
			decorative: false
		}));
	}

	function showDocx(host, buffer) {
		return loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js", "mammoth").then(function (mammoth) {
			return mammoth.convertToHtml({ arrayBuffer: buffer });
		}).then(function (result) {
			clearHost(host);
			host.addItem(new ScrollContainer({
				height: "32rem",
				width: "100%",
				vertical: true,
				content: [
					new HTML({
						sanitizeContent: false,
						content: "<div class=\"sapUiSmallMargin\">" + (result.value || "") + "</div>"
					})
				]
			}));
		});
	}

	function showXlsx(host, buffer) {
		return loadScript("https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js", "XLSX").then(function (XLSX) {
			var workbook = XLSX.read(buffer, { type: "array" });
			var sheet = workbook.Sheets[workbook.SheetNames[0]];
			var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }).slice(0, 40);
			var width = rows.reduce(function (max, row) {
				return Math.max(max, row.length);
			}, 0);
			var columns = [];
			var cells = [];
			for (var i = 0; i < width; i++) {
				columns.push(new Column({
					header: new Text({ text: rows[0] && rows[0][i] ? String(rows[0][i]) : "" })
				}));
				cells.push(new Text({ text: { path: String(i) } }));
			}
			var table = new Table({
				columns: columns,
				items: {
					path: "/",
					template: new ColumnListItem({ cells: cells })
				}
			});
			table.setModel(new JSONModel(rows.slice(1)));
			clearHost(host);
			host.addItem(new ScrollContainer({
				height: "32rem",
				width: "100%",
				vertical: true,
				horizontal: true,
				content: [table]
			}));
		});
	}

	function remember(view, document) {
		view._previewFile = document;
		var button = find(view, "downloadButton");
		var title = find(view, "previewTitle");
		if (button) {
			button.setEnabled(!!document.previewUrl);
		}
		if (title) {
			title.setText(document.fileName || "");
		}
	}

	function preview(view, document) {
		var empty = find(view, "previewEmpty");
		var host = find(view, "previewHost");
		if (!host) {
			return;
		}
		remember(view, document);
		if (empty) {
			empty.setVisible(false);
		}
		host.setVisible(true);
		var url = document.previewUrl;
		var kind = document.fileKind;
		var title = document.fileName || "Document";
		var section = find(view, "documentPreviewSection");
		if (section && section.getDomRef()) {
			section.getDomRef().scrollIntoView({ behavior: "smooth", block: "nearest" });
		}
		if (kind === "doc" || kind === "xls") {
			var office = view.getModel("i18n");
			showMessage(host, title, office ? office.getProperty("previewOffice") : "Use Download for this file.");
			return;
		}
		if (kind === "pdf") {
			showPdf(host, url, title).catch(function () {
				var bundle = view.getModel("i18n");
				showMessage(host, title, bundle ? bundle.getProperty("previewFailed") : "Preview failed");
			});
			return;
		}
		if (kind === "image") {
			asObjectUrl(url).then(function (src) {
				showImage(host, src, title);
			}).catch(function () {
				showImage(host, url, title);
			});
			return;
		}
		fetch(url).then(function (response) {
			if (!response.ok) {
				throw new Error(String(response.status));
			}
			return response.arrayBuffer();
		}).then(function (buffer) {
			if (kind === "docx") {
				return showDocx(host, buffer);
			}
			if (kind === "xlsx") {
				return showXlsx(host, buffer);
			}
			showMessage(host, title, view.getModel("i18n").getProperty("previewFailed"));
		}).catch(function () {
			var bundle = view.getModel("i18n");
			showMessage(host, title, bundle ? bundle.getProperty("previewFailed") : "Preview failed");
		});
	}

	function kindFromName(name) {
		var lower = String(name || "").toLowerCase();
		if (lower.slice(-4) === ".pdf") {
			return "pdf";
		}
		if (lower.slice(-5) === ".docx") {
			return "docx";
		}
		if (lower.slice(-4) === ".doc") {
			return "doc";
		}
		if (lower.slice(-5) === ".xlsx") {
			return "xlsx";
		}
		if (lower.slice(-4) === ".xls") {
			return "xls";
		}
		if (/\.(png|jpe?g|gif|webp|bmp)$/.test(lower)) {
			return "image";
		}
		return "";
	}

	function typeLabel(kind) {
		if (kind === "pdf") {
			return "Uploaded PDF";
		}
		if (kind === "image") {
			return "Uploaded image";
		}
		if (kind === "xls" || kind === "xlsx") {
			return "Uploaded spreadsheet";
		}
		return "Uploaded document";
	}

	function mediaType(kind, file) {
		if (file && file.type) {
			return file.type;
		}
		if (kind === "pdf") {
			return "application/pdf";
		}
		if (kind === "doc") {
			return "application/msword";
		}
		if (kind === "docx") {
			return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
		}
		if (kind === "xls") {
			return "application/vnd.ms-excel";
		}
		if (kind === "image") {
			return "image/png";
		}
		return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
	}

	function toBase64(buffer) {
		var bytes = new Uint8Array(buffer);
		var parts = [];
		for (var i = 0; i < bytes.length; i += 0x8000) {
			parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)));
		}
		return btoa(parts.join(""));
	}

	function refreshTable(view) {
		var table = findTable(view);
		if (!table) {
			return;
		}
		var binding = table.getBinding("items");
		if (binding) {
			binding.refresh();
		}
	}

	function openDocument(view, context) {
		return context.requestObject().then(function (data) {
			preview(view, {
				fileName: data.fileName,
				fileKind: data.fileKind,
				previewUrl: data["content@odata.mediaReadLink"]
			});
		});
	}

	function hookTable(view) {
		var table = findTable(view);
		if (!table || table.data("previewHooked")) {
			return;
		}
		table.data("previewHooked", true);
		var activate = function () {
			table.getItems().forEach(function (item) {
				if (item.setType) {
					item.setType("Active");
				}
			});
		};
		table.attachUpdateFinished(activate);
		activate();
		table.attachItemPress(function (event) {
			var item = event.getParameter("listItem");
			var context = item && item.getBindingContext();
			if (context) {
				openDocument(view, context);
			}
		});
		table.attachSelectionChange(function (event) {
			var item = event.getParameter("listItem");
			var context = item && item.getBindingContext();
			if (context && event.getParameter("selected")) {
				openDocument(view, context);
			}
		});
	}

	return {
		watch: function (view) {
			if (!view) {
				return;
			}
			hookTable(view);
			if (view._documentPreviewWatch) {
				return;
			}
			view._documentPreviewWatch = true;
			view.addEventDelegate({
				onAfterRendering: function () {
					hookTable(view);
					var root = view.getDomRef();
					if (root && window.MutationObserver && !view._documentPreviewObserver) {
						view._documentPreviewObserver = new MutationObserver(function () {
							hookTable(view);
						});
						view._documentPreviewObserver.observe(root, { childList: true, subtree: true });
					}
				}
			});
		},

		onUpload: function (event) {
			var file = event.getParameter("files") && event.getParameter("files")[0];
			var control = event.getSource();
			var view = viewOf(control);
			if (!file || !view) {
				return;
			}
			var kind = kindFromName(file.name);
			var bundle = view.getModel("i18n");
			if (!kind) {
				MessageToast.show(bundle.getProperty("uploadUnsupported"));
				return;
			}
			var context = control.getBindingContext();
			if (!context) {
				return;
			}
			file.arrayBuffer().then(function (buffer) {
				return fetch(view.getModel().getServiceUrl() + context.getPath().replace(/^\//, "") + "/documents", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						documentType: typeLabel(kind),
						fileName: file.name,
						mediaType: mediaType(kind, file),
						contentBase64: toBase64(buffer)
					})
				});
			}).then(function (response) {
				if (!response.ok) {
					throw new Error(String(response.status));
				}
				refreshTable(view);
				MessageToast.show(bundle.getProperty("uploadAdded"));
			}).catch(function () {
				MessageToast.show(bundle.getProperty("uploadFailed"));
			});
			if (control.clear) {
				control.clear();
			}
		},

		onDownload: function (event) {
			var view = viewOf(event.getSource());
			var file = view && view._previewFile;
			var bundle = view && view.getModel("i18n");
			if (!file || !file.previewUrl) {
				return;
			}
			fetch(file.previewUrl).then(function (response) {
				if (!response.ok) {
					throw new Error(String(response.status));
				}
				return response.blob();
			}).then(function (blob) {
				var link = document.createElement("a");
				link.href = URL.createObjectURL(blob);
				link.download = file.fileName || "document";
				document.body.appendChild(link);
				link.click();
				link.remove();
			}).catch(function () {
				MessageToast.show(bundle ? bundle.getProperty("previewFailed") : "Download failed");
			});
		}
	};
});
