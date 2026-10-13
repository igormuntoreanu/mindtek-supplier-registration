sap.ui.define([
	"./localService/mockserver",
	"sap/ui/core/ComponentContainer"
], function (mockserver, ComponentContainer) {
	"use strict";

	if (!/SupplierRegistrations\([^)]+\)/.test(window.location.hash || "")) {
		window.location.replace("#/SupplierRegistrations('SR-1001')");
	}

	function showFailure(error) {
		var node = document.getElementById("content");
		if (node) {
			node.textContent = error && (error.stack || error.message) ? (error.stack || error.message) : String(error);
		}
	}

	mockserver.init().then(function () {
		new ComponentContainer({
			height: "100%",
			name: "mindtek.supplier.registration",
			settings: {
				id: "supplierRegistration"
			},
			async: true,
			manifest: true,
			componentFailed: function (event) {
				showFailure(event.getParameter("reason"));
			}
		}).placeAt("content");
	}).catch(showFailure);
});
