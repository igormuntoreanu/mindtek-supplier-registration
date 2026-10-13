sap.ui.define([
	"sap/ui/core/mvc/ControllerExtension",
	"mindtek/supplier/registration/ext/DocumentPreview",
	"mindtek/supplier/registration/ext/LocationMap",
	"mindtek/supplier/registration/ext/CertificateZoom"
], function (ControllerExtension, DocumentPreview, LocationMap, CertificateZoom) {
	"use strict";

	return ControllerExtension.extend("mindtek.supplier.registration.ext.controller.ObjectPageExt", {
		override: {
			onInit: function () {
				this.getView().attachModelContextChange(this._onContextChange.bind(this));
			},
			routing: {
				onAfterBinding: function () {
					this._onContextChange();
				}
			}
		},

		_onContextChange: function () {
			var view = this.getView();
			DocumentPreview.watch(view);
			LocationMap.watch(view);
			CertificateZoom.watch(view);
		}
	});
});
