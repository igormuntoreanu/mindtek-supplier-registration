sap.ui.define([
	"./engine"
], function (engine) {
	"use strict";

	var SERVICE = engine.SERVICE_ROOT;

	function load(url) {
		return fetch(url).then(function (response) {
			if (!response.ok) {
				throw new Error("Failed to load " + url + " (" + response.status + ")");
			}
			return response;
		});
	}

	function isServiceUrl(url) {
		return String(url || "").indexOf(SERVICE) !== -1;
	}

	function headerMap(headers) {
		var map = {};
		if (!headers) {
			return map;
		}
		if (typeof headers.forEach === "function") {
			headers.forEach(function (value, key) {
				map[key] = value;
			});
			return map;
		}
		Object.keys(headers).forEach(function (key) {
			map[key] = headers[key];
		});
		return map;
	}

	function installFetch(odata) {
		if (!window.fetch || window.fetch._supplierRegistrationPatched) {
			return;
		}
		var nativeFetch = window.fetch.bind(window);
		window.fetch = function (input, init) {
			var url = typeof input === "string" ? input : input && input.url;
			if (!isServiceUrl(url)) {
				return nativeFetch(input, init);
			}
			var method = (init && init.method) || (input && input.method) || "GET";
			var headers = headerMap(init && init.headers);
			var body = init && init.body;
			if (body && typeof body !== "string") {
				return nativeFetch(input, init);
			}
			var result = odata.handle(method, url, body || "", headers);
			return Promise.resolve(new Response(result.body, {
				status: result.status,
				statusText: result.statusText,
				headers: result.headers
			}));
		};
		window.fetch._supplierRegistrationPatched = true;
	}

	function installXhr(odata) {
		if (window.XMLHttpRequest && window.XMLHttpRequest._supplierRegistrationPatched) {
			return;
		}
		var Native = window.XMLHttpRequest;

		function XHR() {
			var native = new Native();
			var mocked = false;
			var asyncRequest = true;
			var method = "GET";
			var url = "";
			var requestHeaders = {};
			var listeners = {};
			var mockResult = null;
			var self = this;

			function copyNative() {
				self.readyState = native.readyState;
				self.status = native.status;
				self.statusText = native.statusText;
				self.responseURL = native.responseURL;
				try {
					self.response = native.response;
				} catch (error) {
					self.response = "";
				}
				try {
					self.responseText = native.responseText;
				} catch (ignore) {
					self.responseText = "";
				}
			}

			this.readyState = 0;
			this.status = 0;
			this.statusText = "";
			this.responseText = "";
			this.response = "";
			this.responseURL = "";
			this.timeout = 0;
			this.withCredentials = false;
			this.onreadystatechange = null;
			this.onload = null;
			this.onerror = null;
			this.onabort = null;
			this.ontimeout = null;
			this.onloadend = null;
			this.upload = native.upload;

			this.open = function (verb, target, async) {
				method = verb;
				url = target;
				asyncRequest = async !== false;
				mocked = isServiceUrl(target);
				if (!mocked) {
					return native.open.apply(native, arguments);
				}
				self.readyState = 1;
			};
			this.setRequestHeader = function (name, value) {
				if (!mocked) {
					return native.setRequestHeader(name, value);
				}
				requestHeaders[name] = value;
			};
			this.overrideMimeType = function () {
				if (!mocked) {
					native.overrideMimeType.apply(native, arguments);
				}
			};
			this.getResponseHeader = function (name) {
				if (!mocked) {
					return native.getResponseHeader(name);
				}
				if (!mockResult) {
					return null;
				}
				var found = Object.keys(mockResult.headers).filter(function (key) {
					return key.toLowerCase() === String(name).toLowerCase();
				})[0];
				return found ? mockResult.headers[found] : null;
			};
			this.getAllResponseHeaders = function () {
				if (!mocked) {
					return native.getAllResponseHeaders();
				}
				if (!mockResult) {
					return "";
				}
				return Object.keys(mockResult.headers).map(function (key) {
					return key + ": " + mockResult.headers[key];
				}).join("\r\n");
			};
			this.abort = function () {
				if (!mocked) {
					native.abort();
				}
			};
			this.addEventListener = function (type, listener) {
				(listeners[type] || (listeners[type] = [])).push(listener);
			};
			this.removeEventListener = function (type, listener) {
				listeners[type] = (listeners[type] || []).filter(function (fn) {
					return fn !== listener;
				});
			};
			this.send = function (body) {
				if (!mocked) {
					native.onreadystatechange = function () {
						copyNative();
						if (typeof self.onreadystatechange === "function") {
							self.onreadystatechange();
						}
					};
					["load", "error", "abort", "timeout", "loadend"].forEach(function (type) {
						native.addEventListener(type, function (event) {
							copyNative();
							var handler = self["on" + type];
							if (typeof handler === "function") {
								handler.call(self, event);
							}
							(listeners[type] || []).forEach(function (listener) {
								listener.call(self, event);
							});
						});
					});
					if (asyncRequest && self.timeout) {
						try {
							native.timeout = self.timeout;
						} catch (ignore) {
							// Keep the original request running.
						}
					}
					try {
						native.withCredentials = self.withCredentials;
					} catch (ignore) {
						// Some requests do not allow credentials to be changed.
					}
					if (self.responseType) {
						try {
							native.responseType = self.responseType;
						} catch (ignore) {
							// Synchronous requests only allow the default response type.
						}
					}
					return native.send(body);
				}
				try {
					mockResult = odata.handle(method, String(url), typeof body === "string" ? body : "", requestHeaders);
				} catch (error) {
					mockResult = {
						status: 500,
						statusText: "Internal Server Error",
						headers: { "Content-Type": "application/json;charset=utf-8", "OData-Version": "4.0" },
						body: JSON.stringify({ error: { code: "MOCK", message: String(error && error.message || error), target: "" } })
					};
				}
				self.readyState = 4;
				self.status = mockResult.status;
				self.statusText = mockResult.statusText || "";
				self.responseText = mockResult.body || "";
				self.response = self.responseText;
				self.responseURL = String(url);
				setTimeout(function () {
					if (typeof self.onreadystatechange === "function") {
						self.onreadystatechange();
					}
					var loadEvent = { type: "load", target: self, currentTarget: self };
					if (typeof self.onload === "function") {
						self.onload(loadEvent);
					}
					(listeners.load || []).forEach(function (listener) {
						listener.call(self, loadEvent);
					});
					var endEvent = { type: "loadend", target: self, currentTarget: self };
					if (typeof self.onloadend === "function") {
						self.onloadend(endEvent);
					}
					(listeners.loadend || []).forEach(function (listener) {
						listener.call(self, endEvent);
					});
				}, 15);
			};
		}

		XHR._supplierRegistrationPatched = true;
		window.XMLHttpRequest = XHR;
	}

	return {
		init: function () {
			if (this._ready) {
				return this._ready;
			}
			var root = sap.ui.require.toUrl("mindtek/supplier/registration/localService");
			var mediaBase = new URL(
				sap.ui.require.toUrl("mindtek/supplier/registration/localService/media") + "/",
				document.baseURI
			).href;
			this._ready = Promise.all([
				load(root + "/metadata.xml").then(function (response) { return response.text(); }),
				load(root + "/mockdata/SupplierRegistration.json").then(function (response) { return response.json(); }),
				load(root + "/mockdata/SupplierDocument.json").then(function (response) { return response.json(); })
			]).then(function (loaded) {
				var odata = engine.createEngine({
					metadataXml: loaded[0],
					registrations: loaded[1],
					documents: loaded[2],
					mediaBase: mediaBase
				});
				installXhr(odata);
				installFetch(odata);
			});
			return this._ready;
		}
	};
});
