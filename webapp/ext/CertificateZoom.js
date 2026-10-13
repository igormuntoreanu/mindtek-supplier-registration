sap.ui.define([
	"sap/ui/core/Element",
	"sap/m/VBox",
	"sap/m/Toolbar",
	"sap/m/Title",
	"sap/m/Button",
	"sap/m/ToolbarSpacer",
	"sap/m/Text",
	"sap/ui/core/HTML"
], function (Element, VBox, Toolbar, Title, Button, ToolbarSpacer, Text, HTML) {
	"use strict";

	var STEPS = [1, 1.25, 1.5, 2, 2.5, 3, 4];
	var stages = {};

	function text(view, key) {
		var bundle = view.getModel("i18n") && view.getModel("i18n").getResourceBundle();
		return bundle ? bundle.getText(key) : key;
	}

	function reducedMotion() {
		return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	}

	function findForm(view) {
		var root = view.getDomRef && view.getDomRef();
		if (!root) {
			return null;
		}
		var candidates = [].slice.call(root.querySelectorAll("[id*='DocumentPreviews']")).filter(function (node) {
			return node.querySelector(".sapFAvatar") && !node.querySelector("[id*='documents::LineItem']");
		});
		candidates.sort(function (a, b) {
			return a.querySelectorAll("*").length - b.querySelectorAll("*").length;
		});
		return candidates.length ? candidates[candidates.length - 1] : null;
	}

	function imageUrl(avatar) {
		var holder = avatar.querySelector(".sapFAvatarImageHolder");
		var value = holder && getComputedStyle(holder).backgroundImage;
		var match = value && value.match(/url\(["']?([^"')]+)/);
		if (match) {
			return match[1];
		}
		var control = Element.getElementById(avatar.id);
		return (control && control.getSrc && control.getSrc()) || "";
	}

	function labelOf(avatar) {
		var element = avatar.closest(".sapUiFormCLElement, .sapUiFormElement");
		var label = element && element.querySelector(".sapMLabel, label");
		return (label && label.textContent || "").replace(/:\s*$/, "").trim();
	}

	function stageFor(view) {
		var id = view.getId();
		if (stages[id]) {
			return stages[id];
		}
		var title = new Title({ level: "H5", text: "" });
		var percent = new Text({ text: "100%" });
		var zoomOut = new Button({
			icon: "sap-icon://zoom-out",
			type: "Transparent",
			tooltip: text(view, "certificateZoomOut"),
			press: function () {
				changeZoom(view, -1);
			}
		});
		var zoomIn = new Button({
			icon: "sap-icon://zoom-in",
			type: "Transparent",
			tooltip: text(view, "certificateZoomIn"),
			press: function () {
				changeZoom(view, 1);
			}
		});
		var fit = new Button({
			icon: "sap-icon://exit-full-screen",
			type: "Transparent",
			tooltip: text(view, "certificateZoomFit"),
			press: function () {
				setZoom(view, 1, true);
			}
		});
		var close = new Button({
			icon: "sap-icon://decline",
			type: "Transparent",
			tooltip: text(view, "certificateClose"),
			press: function () {
				closeStage(view);
			}
		});
		var picture = new HTML({
			sanitizeContent: false,
			content: "<div class='supplierCertificateViewport'><img class='supplierCertificatePicture' alt=''></div>"
		});
		var stage = new VBox({
			width: "100%",
			renderType: "Bare",
			items: [
				new Toolbar({
					content: [title, new ToolbarSpacer(), zoomOut, percent, zoomIn, fit, close]
				}),
				picture
			]
		}).addStyleClass("supplierCertificateStage");
		stages[id] = {
			stage: stage,
			title: title,
			percent: percent,
			zoomOut: zoomOut,
			zoomIn: zoomIn,
			picture: picture,
			scale: 1,
			panX: 0,
			panY: 0,
			url: "",
			avatar: null
		};
		return stages[id];
	}

	function pictureNode(record) {
		var root = record.picture.getDomRef && record.picture.getDomRef();
		return root && root.querySelector(".supplierCertificatePicture");
	}

	function viewportNode(record) {
		var root = record.picture.getDomRef && record.picture.getDomRef();
		return root && root.querySelector(".supplierCertificateViewport");
	}

	function applyTransform(record, animate) {
		var image = pictureNode(record);
		if (!image) {
			return;
		}
		image.classList.toggle("isInstant", !animate);
		image.style.transform = "translate(" + record.panX + "px, " + record.panY + "px) scale(" + record.scale + ")";
		record.percent.setText(Math.round(record.scale * 100) + "%");
		record.zoomOut.setEnabled(record.scale > STEPS[0]);
		record.zoomIn.setEnabled(record.scale < STEPS[STEPS.length - 1]);
	}

	function setZoom(view, scale, animate) {
		var record = stageFor(view);
		record.scale = scale;
		if (scale === 1) {
			record.panX = 0;
			record.panY = 0;
		}
		applyTransform(record, animate);
	}

	function changeZoom(view, direction) {
		var record = stageFor(view);
		var index = 0;
		STEPS.forEach(function (step, position) {
			if (Math.abs(step - record.scale) < 0.01) {
				index = position;
			}
		});
		var next = STEPS[Math.max(0, Math.min(STEPS.length - 1, index + direction))];
		setZoom(view, next, true);
	}

	function bindPointer(view) {
		var record = stageFor(view);
		var viewport = viewportNode(record);
		if (!viewport || viewport.dataset.bound) {
			return;
		}
		viewport.dataset.bound = "1";
		var drag = null;
		viewport.addEventListener("pointerdown", function (event) {
			if (record.scale <= 1) {
				return;
			}
			drag = { x: event.clientX, y: event.clientY, panX: record.panX, panY: record.panY };
			viewport.classList.add("isDragging");
			viewport.setPointerCapture(event.pointerId);
		});
		viewport.addEventListener("pointermove", function (event) {
			if (!drag) {
				return;
			}
			record.panX = drag.panX + event.clientX - drag.x;
			record.panY = drag.panY + event.clientY - drag.y;
			applyTransform(record, false);
		});
		function endDrag() {
			drag = null;
			viewport.classList.remove("isDragging");
		}
		viewport.addEventListener("pointerup", endDrag);
		viewport.addEventListener("pointercancel", endDrag);
		viewport.addEventListener("wheel", function (event) {
			event.preventDefault();
			changeZoom(view, event.deltaY < 0 ? 1 : -1);
		}, { passive: false });
	}

	function hostOf(form) {
		var row = form.closest(".supplierCertificateRow");
		if (!row) {
			row = document.createElement("div");
			row.className = "supplierCertificateRow";
			form.parentNode.insertBefore(row, form);
			row.appendChild(form);
		}
		var host = row.querySelector(":scope > .supplierCertificateHost");
		if (!host) {
			host = document.createElement("div");
			host.className = "supplierCertificateHost";
			row.appendChild(host);
		}
		return host;
	}

	function mount(view) {
		var form = findForm(view);
		if (!form) {
			return null;
		}
		var record = stageFor(view);
		var host = hostOf(form);
		if (!record.stage.getDomRef() || !host.contains(record.stage.getDomRef())) {
			record.stage.placeAt(host);
		}
		bindPointer(view);
		return host;
	}

	function fly(from, to, url, done) {
		if (!from || !to || reducedMotion()) {
			done();
			return;
		}
		var ghost = document.createElement("img");
		ghost.className = "supplierCertificateGhost";
		ghost.alt = "";
		ghost.src = url;
		ghost.style.left = from.left + "px";
		ghost.style.top = from.top + "px";
		ghost.style.width = from.width + "px";
		ghost.style.height = from.height + "px";
		document.body.appendChild(ghost);
		ghost.getBoundingClientRect();
		requestAnimationFrame(function () {
			ghost.style.left = to.left + "px";
			ghost.style.top = to.top + "px";
			ghost.style.width = to.width + "px";
			ghost.style.height = to.height + "px";
		});
		var finished = false;
		function complete() {
			if (finished) {
				return;
			}
			finished = true;
			ghost.remove();
			done();
		}
		ghost.addEventListener("transitionend", complete);
		setTimeout(complete, 520);
	}

	function destination(record) {
		var viewport = viewportNode(record);
		if (!viewport) {
			return null;
		}
		var box = viewport.getBoundingClientRect();
		var size = Math.min(box.width, box.height) * 0.92;
		return {
			left: box.left + (box.width - size) / 2,
			top: box.top + (box.height - size) / 2,
			width: size,
			height: size
		};
	}

	function open(view, avatar) {
		var url = imageUrl(avatar);
		if (!url) {
			return;
		}
		var host = mount(view);
		var record = stageFor(view);
		if (!host) {
			return;
		}
		var title = labelOf(avatar);
		var from = avatar.getBoundingClientRect();
		var already = host.classList.contains("isOpen");
		if (record.avatar && record.avatar !== avatar) {
			record.avatar.classList.remove("supplierCertificateSelected");
		}
		record.avatar = avatar;
		avatar.classList.add("supplierCertificateSelected");
		record.title.setText(title);
		var image = pictureNode(record);
		if (image) {
			image.style.opacity = "0";
		}
		host.classList.add("isOpen");
		var reveal = function () {
			var target = destination(record);
			fly(from, target, url, function () {
				var node = pictureNode(record);
				if (node) {
					node.src = url;
					node.alt = title;
					node.style.opacity = "1";
				}
				record.url = url;
				record.scale = 1;
				record.panX = 0;
				record.panY = 0;
				applyTransform(record, false);
			});
		};
		if (already) {
			reveal();
			return;
		}
		var started = false;
		function begin() {
			if (started) {
				return;
			}
			started = true;
			reveal();
		}
		host.addEventListener("transitionend", function (event) {
			if (event.target === host && event.propertyName === "flex-basis") {
				begin();
			}
		}, { once: true });
		setTimeout(begin, 480);
	}

	function stageHost(form) {
		var row = form && form.closest(".supplierCertificateRow");
		return row && row.querySelector(":scope > .supplierCertificateHost");
	}

	function closeStage(view) {
		var record = stages[view.getId()];
		var host = stageHost(findForm(view));
		if (!record || !host || !host.classList.contains("isOpen")) {
			return;
		}
		var image = pictureNode(record);
		var from = image && image.getBoundingClientRect();
		var back = record.avatar && record.avatar.getBoundingClientRect();
		if (image) {
			image.style.opacity = "0";
		}
		fly(from, back, record.url, function () {
			host.classList.remove("isOpen");
			if (record.avatar) {
				record.avatar.classList.remove("supplierCertificateSelected");
				record.avatar = null;
			}
			record.url = "";
			record.title.setText("");
		});
	}

	function onCertificateClick(view, event) {
		var avatar = event.target.closest && event.target.closest(".sapFAvatar");
		if (!avatar) {
			return;
		}
		var form = avatar.closest("[id*='DocumentPreviews']");
		if (!form || form.querySelector("[id*='documents::LineItem']")) {
			return;
		}
		open(view, avatar);
	}

	function watch(view) {
		if (!view) {
			return;
		}
		var path = view.getBindingContext() && view.getBindingContext().getPath();
		if (view._certificatePath && path && view._certificatePath !== path) {
			var record = stages[view.getId()];
			var host = stageHost(findForm(view));
			if (host) {
				host.classList.remove("isOpen");
			}
			if (record && record.avatar) {
				record.avatar.classList.remove("supplierCertificateSelected");
				record.avatar = null;
			}
		}
		if (path) {
			view._certificatePath = path;
		}
		var root = view.getDomRef && view.getDomRef();
		if (root) {
			mount(view);
			if (!view._certificateZoom) {
				view._certificateZoom = true;
				root.addEventListener("click", function (event) {
					onCertificateClick(view, event);
				});
			}
			if (window.MutationObserver && !view._certificateObserver) {
				view._certificateObserver = new MutationObserver(function () {
					mount(view);
				});
				view._certificateObserver.observe(root, { childList: true, subtree: true });
			}
		}
		if (view._certificateDelegate) {
			return;
		}
		view._certificateDelegate = true;
		view.addEventDelegate({
			onAfterRendering: function () {
				watch(view);
			}
		});
	}

	return { watch: watch };
});
