sap.ui.define([
	"sap/ui/core/Element"
], function (Element) {
	"use strict";

	var leafletPromise;

	function loadLeaflet() {
		if (window.L) {
			return Promise.resolve(window.L);
		}
		if (!leafletPromise) {
			leafletPromise = new Promise(function (resolve, reject) {
				var script = document.createElement("script");
				script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
				script.onload = function () {
					resolve(window.L);
				};
				script.onerror = function () {
					reject(new Error("Map library failed to load."));
				};
				document.head.appendChild(script);
			});
		}
		return leafletPromise;
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
		return found || Element.getElementById(suffix);
	}

	function mapNode(control) {
		var root = control && control.getDomRef && control.getDomRef();
		if (!root) {
			return null;
		}
		return root.querySelector ? (root.querySelector(".supplierLocationMap") || root) : root;
	}

	function readPlace(view) {
		var context = view.getBindingContext();
		if (!context) {
			return Promise.resolve(null);
		}
		var latitude = Number(context.getProperty("latitude"));
		var longitude = Number(context.getProperty("longitude"));
		var addressLine = context.getProperty("addressLine") || "";
		if (isFinite(latitude) && isFinite(longitude)) {
			return Promise.resolve({ latitude: latitude, longitude: longitude, addressLine: addressLine });
		}
		var model = view.getModel();
		return fetch(model.getServiceUrl() + context.getPath().replace(/^\//, "")).then(function (response) {
			return response.json();
		}).then(function (data) {
			return {
				latitude: Number(data.latitude),
				longitude: Number(data.longitude),
				addressLine: data.addressLine || addressLine
			};
		});
	}

	function render(view) {
		var html = find(view, "locationMap");
		var address = find(view, "locationAddress");
		var link = find(view, "locationLink");
		if (!view.getBindingContext() || !html) {
			return;
		}
		readPlace(view).then(function (place) {
			if (!place || !isFinite(place.latitude) || !isFinite(place.longitude)) {
				return;
			}
			draw(view, html, address, link, place);
		});
	}

	function draw(view, html, address, link, place) {
		var latitude = place.latitude;
		var longitude = place.longitude;
		var addressLine = place.addressLine || "";
		if (address && address.setText) {
			address.setText(addressLine);
		}
		if (link && link.setHref) {
			link.setHref("https://www.openstreetmap.org/?mlat=" + latitude + "&mlon=" + longitude + "#map=15/" + latitude + "/" + longitude);
		}
		var node = mapNode(html);
		if (!node || !node.isConnected) {
			view._mapTries = (view._mapTries || 0) + 1;
			if (view._mapTries < 12) {
				setTimeout(function () {
					render(view);
				}, 400);
			}
			return;
		}
		loadLeaflet().then(function (Leaflet) {
			if (!node.isConnected) {
				return;
			}
			if (!view._supplierMap) {
				view._supplierMap = Leaflet.map(node, { scrollWheelZoom: false }).setView([latitude, longitude], 14);
				Leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
					maxZoom: 19,
					attribution: "&copy; OpenStreetMap"
				}).addTo(view._supplierMap);
				view._supplierMarker = Leaflet.marker([latitude, longitude]).addTo(view._supplierMap);
			} else {
				view._supplierMarker.setLatLng([latitude, longitude]);
				view._supplierMap.setView([latitude, longitude], 14);
			}
			setTimeout(function () {
				if (view._supplierMap) {
					view._supplierMap.invalidateSize();
				}
			}, 200);
		}).catch(function () {
			if (address && address.setText) {
				address.setText(addressLine);
			}
		});
	}

	return {
		watch: function (view) {
			if (!view || view._supplierMapWatch) {
				render(view);
				return;
			}
			view._supplierMapWatch = true;
			view.addEventDelegate({
				onAfterRendering: function () {
					render(view);
				}
			});
			render(view);
		}
	};
});
