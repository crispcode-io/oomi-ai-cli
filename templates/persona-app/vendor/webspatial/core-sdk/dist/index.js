
    (function(){
      if(typeof window === 'undefined') return;
      if(!window.__webspatialsdk__) window.__webspatialsdk__ = {}
      window.__webspatialsdk__['core-sdk-version'] = "1.2.1"
  })()
    
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/platform-adapter/CommandResultUtils.ts
function CommandResultSuccess(data) {
  return {
    success: true,
    data,
    errorCode: "",
    errorMessage: ""
  };
}
function CommandResultFailure(errorCode, errorMessage = "") {
  return {
    success: false,
    data: void 0,
    errorCode,
    errorMessage
  };
}
var init_CommandResultUtils = __esm({
  "src/platform-adapter/CommandResultUtils.ts"() {
    "use strict";
  }
});

// src/platform-adapter/puppeteer/PuppeteerPlatform.ts
var PuppeteerPlatform_exports = {};
__export(PuppeteerPlatform_exports, {
  PuppeteerPlatform: () => PuppeteerPlatform
});
var PuppeteerPlatform;
var init_PuppeteerPlatform = __esm({
  "src/platform-adapter/puppeteer/PuppeteerPlatform.ts"() {
    "use strict";
    init_CommandResultUtils();
    console.log("PuppeteerPlatform");
    PuppeteerPlatform = class {
      // 存储iframe实例
      iframeRegistry = /* @__PURE__ */ new Map();
      constructor() {
      }
      callJSB(cmd, msg) {
        return new Promise((resolve) => {
          try {
            if (window.__handleJSBMessage) {
              try {
                console.log(` core-sdk Puppeteer Platform: callJSB: ${cmd}::${msg}`);
                const result = window.__handleJSBMessage(`${cmd}::${msg}`);
                console.log(
                  ` core-sdk Puppeteer Platform callJSB result: ${result}`
                );
                resolve(CommandResultSuccess(result));
              } catch (err) {
                resolve(CommandResultFailure("500", "JSB execution error"));
              }
            } else {
              resolve(CommandResultSuccess("ok"));
            }
          } catch (error) {
            console.error(
              `PuppeteerPlatform cmd Error: ${cmd}, msg: ${msg} error: ${error}`
            );
            resolve(CommandResultFailure("500", "Internal error"));
          }
        });
      }
      /**
       * 同步创建Spatialized2DElement到Puppeteer Runner
       */
      createSpatializedElementSync(spatialId, webspatialUrl) {
        try {
          console.log(
            `[Puppeteer Platform] Creating spatialized element sync with id: ${spatialId}, url: ${webspatialUrl}`
          );
          const win = window;
          if (win.__handleJSBMessage) {
            const createCommand = {
              id: spatialId,
              url: webspatialUrl
            };
            win.__handleJSBMessage(
              `CreateSpatialized2DElement::${JSON.stringify(createCommand)}`
            );
          }
        } catch (error) {
          console.error("Error creating spatialized element sync:", error);
        }
      }
      callWebSpatialProtocol(command, query, target, features) {
        console.log(
          `PuppeteerPlatform: Calling webspatial protocol: webspatial://${command}${query ? `?${query}` : ""}`
        );
        return new Promise((resolve) => {
          try {
            const webspatialUrl = `webspatial://${command}${query ? `?${query}` : ""}`;
            const { spatialId, iframe, windowProxy } = this.createIframeWindow(
              webspatialUrl,
              target,
              features
            );
            if (command === "createSpatialized2DElement") {
              this.createSpatializedElementSync(spatialId, webspatialUrl);
            }
            console.log(
              `[Puppeteer Platform] iframe created with spatialId: ${spatialId}`
            );
            this.iframeRegistry.set(spatialId, iframe);
            resolve(CommandResultSuccess({ windowProxy, id: spatialId }));
          } catch (error) {
            console.error("Error calling webspatial protocol:", error);
            resolve(
              CommandResultFailure("500", "Failed to call webspatial protocol")
            );
          }
        });
      }
      callWebSpatialProtocolSync(command, query, target, features) {
        try {
          const webspatialUrl = `webspatial://${command}${query ? `?${query}` : ""}`;
          console.log(`Calling webspatial protocol sync: ${webspatialUrl}`);
          const { spatialId, iframe, windowProxy } = this.createIframeWindow(
            webspatialUrl,
            target,
            features
          );
          if (command === "createSpatialized2DElement") {
            this.createSpatializedElementSync(spatialId, webspatialUrl);
          }
          this.iframeRegistry.set(spatialId, iframe);
          return CommandResultSuccess({ windowProxy, id: spatialId });
        } catch (error) {
          console.error("Error calling webspatial protocol sync:", error);
          return CommandResultFailure(
            "500",
            "Failed to call webspatial protocol sync"
          );
        }
      }
      /**
       * 创建基于iframe的窗口
       */
      createIframeWindow(url, target, features) {
        const iframe = document.createElement("iframe");
        iframe.style.border = "none";
        iframe.style.display = "none";
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        const spatialId = this.generateUUID();
        iframe.spatialId = spatialId;
        iframe.id = `spatial-iframe-${spatialId}`;
        const featuresObj = this.parseFeatures(features || "");
        if (featuresObj.width) {
          iframe.style.width = featuresObj.width;
        }
        if (featuresObj.height) {
          iframe.style.height = featuresObj.height;
        }
        if (featuresObj.left) {
          iframe.style.left = featuresObj.left;
          iframe.style.position = "absolute";
        }
        if (featuresObj.top) {
          iframe.style.top = featuresObj.top;
          iframe.style.position = "absolute";
        }
        document.body.appendChild(iframe);
        const windowProxy = this.createEnhancedWindowProxy(iframe, url, spatialId);
        iframe.src = "about:blank";
        console.log(
          `PuppeteerPlatform created iframe window with spatialId: ${spatialId}, URL: ${url}`
        );
        this.initializeIframeContent(iframe, url, spatialId);
        return { spatialId, iframe, windowProxy };
      }
      /**
       * 创建增强的windowProxy对象
       */
      createEnhancedWindowProxy(iframe, url, spatialId) {
        return {
          // 基本属性
          location: {
            href: url,
            toString: () => url,
            reload: () => {
              if (iframe.contentWindow) {
                iframe.contentWindow.location.reload();
              }
            }
          },
          navigator: {
            userAgent: `Mozilla/5.0 (WebKit) SpatialId/${spatialId}`
          },
          // 方法
          close: () => {
            console.log(`Closing iframe with spatialId: ${spatialId}`);
            iframe.remove();
            this.iframeRegistry.delete(spatialId);
          },
          // 文档访问
          document: iframe.contentDocument || {},
          contentWindow: iframe.contentWindow || {},
          // 添加消息通信方法
          postMessage: (message, targetOrigin) => {
            if (iframe.contentWindow) {
              iframe.contentWindow.postMessage(message, targetOrigin || "*");
            }
          },
          // 添加事件监听方法
          addEventListener: (type, listener) => {
            if (iframe.contentWindow) {
              iframe.contentWindow.addEventListener(type, listener);
            }
          },
          removeEventListener: (type, listener) => {
            if (iframe.contentWindow) {
              iframe.contentWindow.removeEventListener(type, listener);
            }
          },
          // 执行JavaScript
          executeScript: (code) => {
            if (iframe.contentWindow) {
              try {
                const win = iframe.contentWindow;
                return win.eval(code);
              } catch (error) {
                console.error(
                  `Error executing script in iframe ${spatialId}:`,
                  error
                );
                return null;
              }
            }
            return null;
          },
          // 获取iframe引用
          getIframe: () => iframe,
          // 获取spatialId
          getSpatialId: () => spatialId
        };
      }
      /**
       * 初始化iframe内容
       */
      initializeIframeContent(iframe, url, spatialId) {
        try {
          iframe.onload = () => {
            try {
              const iframeContent = `
            // \u6CE8\u5165\u901A\u4FE1\u811A\u672C
            window.webSpatialId = '${spatialId}';
            window.SpatialId = '${spatialId}';
            
            // \u91CD\u5199window.open\u4EE5\u652F\u6301webspatial\u534F\u8BAE
            const originalOpen = window.open;
            window.open = function(url, target, features) {
              if (url && url.startsWith('webspatial://')) {
                // \u901A\u8FC7windowProxy\u5904\u7406webspatial\u534F\u8BAE
                const windowProxy = new Proxy({}, {
                  get: function(target, prop) {
                    if (prop === 'toString') {
                      return function() { return url; };
                    }
                    return undefined;
                  }
                });
                return windowProxy;
              }
              return originalOpen.call(window, url, target, features);
            };
            
            // \u8BBE\u7F6Enavigator.userAgent\u4EE5\u8BC6\u522Bwebspatial\u73AF\u5883
            Object.defineProperty(navigator, 'userAgent', {
              value: 'WebSpatial/1.0 ' + navigator.userAgent,
              configurable: true
            });
            
            // \u53D1\u9001\u52A0\u8F7D\u5B8C\u6210\u6D88\u606F
            window.parent.postMessage({
              type: 'iframe_loaded',
              spatialId: '${spatialId}',
              url: '${url}'
            }, '${window.location.origin}');
            
            // \u8BBE\u7F6E\u6D88\u606F\u5904\u7406\u5668
            window.addEventListener('message', (event) => {
              if (event.origin !== window.parent.location.origin) return;
              
              const data = event.data;
              if (data && data.type === 'webspatial_command') {
                // \u5904\u7406\u6765\u81EA\u7236\u7A97\u53E3\u7684\u547D\u4EE4
                console.log('Received command in iframe from parent:', data.command);
                // \u8FD9\u91CC\u53EF\u4EE5\u6DFB\u52A0\u547D\u4EE4\u5904\u7406\u903B\u8F91
              }
            });
          `;
              const doc = iframe.contentDocument;
              if (doc) {
                doc.open();
                doc.write(`
              <!DOCTYPE html>
              <html>
              <head>
                <title>Spatial Iframe - ${spatialId}</title>
                <meta charset="UTF-8">
                <style>
                  body {
                    margin: 0;
                    padding: 0;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  }
                </style>
              </head>
              <body>
                <script>${iframeContent}</script>
              </body>
              </html>
            `);
                doc.close();
              }
            } catch (error) {
              console.error("Error initializing iframe content:", error);
            }
          };
        } catch (error) {
          console.error("Error setting up iframe:", error);
        }
      }
      /**
       * 解析features字符串为对象
       */
      parseFeatures(features) {
        const result = {};
        const pairs = features.split(",");
        pairs.forEach((pair) => {
          const [key, value] = pair.split("=").map((s) => s.trim());
          if (key && value) {
            result[key] = value;
          }
        });
        return result;
      }
      /**
       * 发送消息到指定spatialId的iframe
       */
      sendMessageToIframe(spatialId, message) {
        const iframe = this.iframeRegistry.get(spatialId);
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage(message, window.location.origin);
          return true;
        }
        return false;
      }
      /**
       * 获取所有活跃的iframe
       */
      getAllActiveIframes() {
        const result = [];
        this.iframeRegistry.forEach((iframe, spatialId) => {
          result.push({ spatialId, iframe });
        });
        return result;
      }
      /**
       * 清理资源
       */
      dispose() {
        this.iframeRegistry.forEach((iframe, spatialId) => {
          console.log(`Disposing iframe with spatialId: ${spatialId}`);
          iframe.remove();
        });
        this.iframeRegistry.clear();
      }
      // 生成UUID函数
      generateUUID() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
          /[xy]/g,
          function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === "x" ? r : r & 3 | 8;
            return v.toString(16).toUpperCase();
          }
        );
      }
    };
  }
});

// src/SpatialWebEvent.ts
var SpatialWebEvent;
var init_SpatialWebEvent = __esm({
  "src/SpatialWebEvent.ts"() {
    "use strict";
    SpatialWebEvent = class _SpatialWebEvent {
      static eventReceiver = {};
      static init() {
        window.__SpatialWebEvent = ({ id, data }) => {
          _SpatialWebEvent.eventReceiver[id]?.(data);
        };
      }
      static addEventReceiver(id, callback) {
        _SpatialWebEvent.eventReceiver[id] = callback;
      }
      static removeEventReceiver(id) {
        delete _SpatialWebEvent.eventReceiver[id];
      }
    };
  }
});

// src/platform-adapter/xr/XRPlatform.ts
var XRPlatform_exports = {};
__export(XRPlatform_exports, {
  XRPlatform: () => XRPlatform
});
function nextRequestId() {
  requestId = (requestId + 1) % MAX_ID;
  return `rId_${requestId}`;
}
var requestId, MAX_ID, XRPlatform;
var init_XRPlatform = __esm({
  "src/platform-adapter/xr/XRPlatform.ts"() {
    "use strict";
    init_CommandResultUtils();
    init_SpatialWebEvent();
    requestId = 0;
    MAX_ID = 1e5;
    XRPlatform = class {
      async callJSB(cmd, msg) {
        return new Promise((resolve, reject) => {
          try {
            const rId = nextRequestId();
            SpatialWebEvent.addEventReceiver(rId, (result) => {
              SpatialWebEvent.removeEventReceiver(rId);
              if (result.success) {
                resolve(CommandResultSuccess(result.data));
              } else {
                const { code, message } = result.data;
                resolve(CommandResultFailure(code, message));
              }
            });
            const ans = window.webspatialBridge.postMessage(rId, cmd, msg);
            if (ans !== "") {
              SpatialWebEvent.removeEventReceiver(rId);
              const result = JSON.parse(ans);
              if (result.success) {
                resolve(CommandResultSuccess(result.data));
              } else {
                const { code, message } = result.data;
                resolve(CommandResultFailure(code, message));
              }
            }
          } catch (error) {
            console.error(`XRPlatform cmd: ${cmd}, msg: ${msg} error: ${error}`);
            const { code, message } = error;
            resolve(CommandResultFailure(code, message));
          }
        });
      }
      async callWebSpatialProtocol(command, query, target, features) {
        return new Promise((resolve, reject) => {
          const createdId = nextRequestId();
          try {
            let windowProxy = null;
            SpatialWebEvent.addEventReceiver(
              createdId,
              (result) => {
                console.log("createdId", createdId, result.spatialId);
                resolve(
                  CommandResultSuccess({
                    windowProxy,
                    id: result.spatialId
                  })
                );
                SpatialWebEvent.removeEventReceiver(createdId);
              }
            );
            windowProxy = this.openWindow(
              command,
              query,
              target,
              features
            ).windowProxy;
            windowProxy?.open(`about:blank?rid=${createdId}`, "_self");
          } catch (error) {
            console.error(`open window error: ${error}`);
            const { code, message } = error;
            SpatialWebEvent.removeEventReceiver(createdId);
            resolve(CommandResultFailure(code, message));
          }
        });
      }
      callWebSpatialProtocolSync(command, query, target, features) {
        const { spatialId: id = "", windowProxy } = this.openWindow(
          command,
          query,
          target,
          features
        );
        return CommandResultSuccess({ windowProxy, id });
      }
      openWindow(command, query, target, features) {
        const windowProxy = window.open(
          `webspatial://${command}?${query || ""}`,
          target,
          features
        );
        return { spatialId: "", windowProxy };
      }
    };
  }
});

// src/platform-adapter/android/AndroidPlatform.ts
var AndroidPlatform_exports = {};
__export(AndroidPlatform_exports, {
  AndroidPlatform: () => AndroidPlatform
});
function nextRequestId2() {
  requestId2 = (requestId2 + 1) % MAX_ID2;
  return `rId_${requestId2}`;
}
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : r & 3 | 8).toString(16);
  });
}
function supportsLiveWindowProxyMode() {
  return window.__WebSpatialAndroidConfig?.renderMode === "live-window";
}
function appendQueryParam(query, key, value) {
  const prefix = query && query.length > 0 ? `${query}&` : "";
  return `${prefix}${key}=${encodeURIComponent(value)}`;
}
function isWindowDocumentReady(windowProxy) {
  const childWindow = windowProxy;
  const href = childWindow.location?.href;
  if (!href || href.startsWith("about:")) {
    return false;
  }
  const document2 = childWindow.document;
  if (!document2?.head || !document2.body) {
    return false;
  }
  if (document2.readyState !== "interactive" && document2.readyState !== "complete") {
    return false;
  }
  return childWindow.__WebSpatialChildReady === true;
}
function hasWindowDocumentStructure(windowProxy) {
  const href = windowProxy.location?.href;
  if (!href || href.startsWith("about:")) {
    return false;
  }
  const document2 = windowProxy.document;
  return Boolean(document2?.head && document2.body);
}
async function waitForWindowDocument(windowProxy, timeoutMs = 8e3) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (isWindowDocumentReady(windowProxy)) {
        return true;
      }
    } catch {
    }
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  try {
    if (hasWindowDocumentStructure(windowProxy)) {
      console.warn(
        "[AndroidPlatform] Falling back to partially ready child window after timeout",
        windowProxy.location?.href
      );
      return true;
    }
  } catch {
  }
  return false;
}
function createFakeWindowProxy(elementId) {
  const createStyleProxy = () => {
    const styleObj = {
      cssText: "",
      backgroundColor: "",
      margin: "",
      display: "",
      minWidth: "",
      minHeight: "",
      maxWidth: "",
      background: "",
      visibility: "",
      position: "",
      top: "",
      left: "",
      width: "",
      height: "",
      overflow: "",
      transform: "",
      opacity: "",
      borderRadius: ""
    };
    return new Proxy(styleObj, {
      get(target, prop) {
        if (prop === "setProperty") {
          return (name, value) => {
            target[name] = value;
          };
        }
        if (prop === "getPropertyValue") {
          return (name) => target[name] || "";
        }
        if (prop === "removeProperty") {
          return (name) => {
            const oldValue = target[name];
            delete target[name];
            return oldValue || "";
          };
        }
        return target[prop] ?? "";
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      }
    });
  };
  const createFakeElement = (tagName) => ({
    tagName: tagName.toUpperCase(),
    style: createStyleProxy(),
    setAttribute: () => {
    },
    getAttribute: () => null,
    appendChild: () => {
    },
    removeChild: () => {
    },
    innerHTML: "",
    textContent: "",
    className: "",
    id: "",
    name: "",
    content: ""
  });
  const fakeDocument = {
    documentElement: {
      style: createStyleProxy(),
      className: ""
    },
    head: {
      innerHTML: "",
      appendChild: () => {
      },
      removeChild: () => {
      },
      children: [],
      querySelectorAll: () => []
    },
    body: {
      innerHTML: "",
      style: createStyleProxy(),
      appendChild: () => {
      },
      removeChild: () => {
      },
      className: ""
    },
    title: "",
    onclick: null,
    createElement: (tagName) => createFakeElement(tagName),
    createTextNode: (text) => ({ textContent: text }),
    getElementById: () => null,
    querySelector: (selector) => {
      if (selector === 'meta[name="viewport"]') {
        return null;
      }
      return null;
    },
    querySelectorAll: () => [],
    write: () => {
    },
    close: () => {
    }
  };
  const fakeWindow = {
    __SpatialId: elementId,
    document: fakeDocument,
    location: {
      href: "about:blank"
    },
    navigator: {
      userAgent: window?.navigator?.userAgent ?? ""
    },
    addEventListener: () => {
    },
    removeEventListener: () => {
    },
    postMessage: () => {
    },
    close: () => {
    },
    focus: () => {
    },
    blur: () => {
    },
    open: () => fakeWindow,
    // For portal rendering (React needs these)
    parent: null,
    top: null,
    closed: false
  };
  fakeWindow.parent = fakeWindow;
  fakeWindow.top = fakeWindow;
  return fakeWindow;
}
var requestId2, MAX_ID2, AndroidPlatform;
var init_AndroidPlatform = __esm({
  "src/platform-adapter/android/AndroidPlatform.ts"() {
    "use strict";
    init_CommandResultUtils();
    init_SpatialWebEvent();
    requestId2 = 0;
    MAX_ID2 = 1e5;
    AndroidPlatform = class {
      async callJSB(cmd, msg) {
        return new Promise((resolve, reject) => {
          try {
            const rId = nextRequestId2();
            SpatialWebEvent.addEventReceiver(rId, (result) => {
              SpatialWebEvent.removeEventReceiver(rId);
              if (result.success) {
                resolve(CommandResultSuccess(result.data));
              } else {
                const { code, message } = result.data;
                resolve(CommandResultFailure(code, message));
              }
            });
            const ans = window.webspatialBridge.postMessage(rId, cmd, msg);
            if (ans !== "") {
              SpatialWebEvent.removeEventReceiver(rId);
              const result = JSON.parse(ans);
              if (result.success) {
                resolve(CommandResultSuccess(result.data));
              } else {
                const { code, message } = result.data;
                resolve(CommandResultFailure(code, message));
              }
            }
          } catch (error) {
            console.error(
              `AndroidPlatform cmd: ${cmd}, msg: ${msg} error: ${error}`
            );
            const { code, message } = error;
            resolve(CommandResultFailure(code, message));
          }
        });
      }
      async callWebSpatialProtocol(command, query, target, features) {
        if (command === "createSpatialized2DElement" && supportsLiveWindowProxyMode()) {
          const elementId2 = uuid();
          const windowProxy2 = window.open(
            `webspatial://${command}?${appendQueryParam(query, "id", elementId2)}`,
            target,
            features
          );
          if (!windowProxy2) {
            return CommandResultFailure(
              "WindowOpenFailed",
              `Unable to open child window for ${command}`
            );
          }
          try {
            ;
            windowProxy2.__SpatialId = elementId2;
          } catch {
          }
          const windowReady = await waitForWindowDocument(windowProxy2);
          if (!windowReady) {
            return CommandResultFailure(
              "WindowProxyUnavailable",
              `Timed out waiting for ${command} child window to become scriptable`
            );
          }
          return CommandResultSuccess({ windowProxy: windowProxy2, id: elementId2 });
        }
        const jsbCommand = this.mapProtocolToJSBCommand(command);
        if (!jsbCommand) {
          console.warn(`[AndroidPlatform] Unknown protocol command: ${command}`);
          return CommandResultFailure(
            "UnknownCommand",
            `Unknown command: ${command}`
          );
        }
        const elementId = uuid();
        const params = { id: elementId };
        if (query) {
          const searchParams = new URLSearchParams(query);
          searchParams.forEach((value, key) => {
            try {
              params[key] = JSON.parse(decodeURIComponent(value));
            } catch {
              params[key] = decodeURIComponent(value);
            }
          });
        }
        const result = await this.callJSB(jsbCommand, JSON.stringify(params));
        if (!result.success) {
          return result;
        }
        const nativeId = result.data?.id || elementId;
        const windowProxy = createFakeWindowProxy(nativeId);
        return CommandResultSuccess({ windowProxy, id: nativeId });
      }
      /**
       * Maps webspatial:// protocol commands to JSB command names.
       */
      mapProtocolToJSBCommand(command) {
        const commandMap = {
          createSpatialized2DElement: "CreateSpatialized2DElement",
          createSpatializedStatic3DElement: "CreateSpatializedStatic3DElement",
          createSpatializedDynamic3DElement: "CreateSpatializedDynamic3DElement",
          createSpatialScene: "CreateSpatialScene"
        };
        return commandMap[command] || null;
      }
      callWebSpatialProtocolSync(command, query, target, features) {
        if (command === "createSpatialized2DElement" && supportsLiveWindowProxyMode()) {
          const elementId2 = uuid();
          const windowProxy2 = window.open(
            `webspatial://${command}?${appendQueryParam(query, "id", elementId2)}`,
            target,
            features
          );
          if (!windowProxy2) {
            return CommandResultFailure(
              "WindowOpenFailed",
              `Unable to open child window for ${command}`
            );
          }
          try {
            ;
            windowProxy2.__SpatialId = elementId2;
          } catch {
          }
          return CommandResultSuccess({ windowProxy: windowProxy2, id: elementId2 });
        }
        const elementId = uuid();
        const windowProxy = createFakeWindowProxy(elementId);
        try {
          window.open(
            `webspatial://${command}?id=${elementId}&${query || ""}`,
            target,
            features
          );
        } catch (e) {
          console.warn("[AndroidPlatform] window.open failed:", e);
        }
        return CommandResultSuccess({ windowProxy, id: elementId });
      }
    };
  }
});

// src/platform-adapter/vision-os/VisionOSPlatform.ts
var VisionOSPlatform_exports = {};
__export(VisionOSPlatform_exports, {
  VisionOSPlatform: () => VisionOSPlatform
});
var VisionOSPlatform;
var init_VisionOSPlatform = __esm({
  "src/platform-adapter/vision-os/VisionOSPlatform.ts"() {
    "use strict";
    init_CommandResultUtils();
    VisionOSPlatform = class {
      async callJSB(cmd, msg) {
        try {
          const result = await window.webkit.messageHandlers.bridge.postMessage(
            `${cmd}::${msg}`
          );
          return CommandResultSuccess(result);
        } catch (error) {
          const { code, message } = JSON.parse(error.message);
          return CommandResultFailure(code, message);
        }
      }
      callWebSpatialProtocol(command, query, target, features) {
        const { spatialId: id, windowProxy } = this.openWindow(
          command,
          query,
          target,
          features
        );
        return Promise.resolve(
          CommandResultSuccess({ windowProxy, id })
        );
      }
      callWebSpatialProtocolSync(command, query, target, features) {
        const { spatialId: id = "", windowProxy } = this.openWindow(
          command,
          query,
          target,
          features
        );
        return CommandResultSuccess({ windowProxy, id });
      }
      openWindow(command, query, target, features) {
        const windowProxy = window.open(
          `webspatial://${command}?${query || ""}`,
          target,
          features
        );
        const ua = windowProxy?.navigator.userAgent;
        const spatialId = ua?.match(
          /\b([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})\b/gi
        )?.[0];
        return { spatialId, windowProxy };
      }
    };
  }
});

// src/ssr-polyfill.ts
var isSSR = typeof window === "undefined";
var isSSREnv = () => isSSR;

// src/platform-adapter/ssr/SSRPlatform.ts
var SSRPlatform = class {
  callJSB(cmd, msg) {
    return Promise.resolve({
      success: true,
      data: void 0,
      errorCode: void 0,
      errorMessage: void 0
    });
  }
  callWebSpatialProtocol(schema, query, target, features) {
    return Promise.resolve({
      success: true,
      data: void 0,
      errorCode: void 0,
      errorMessage: void 0
    });
  }
  callWebSpatialProtocolSync(schema, query, target, features, resultCallback) {
    return {
      success: true,
      data: void 0,
      errorCode: void 0,
      errorMessage: void 0
    };
  }
};

// src/platform-adapter/index.ts
function getWebSpatialVersion(ua) {
  const match = ua.match(/WebSpatial\/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
function isVersionGreater(a, b) {
  if (!a) {
    return false;
  }
  for (let index = 0; index < 3; index += 1) {
    const diff = a[index] - b[index];
    if (diff > 0) {
      return true;
    }
    if (diff < 0) {
      return false;
    }
  }
  return false;
}
function createPlatform() {
  if (isSSREnv()) {
    return new SSRPlatform();
  }
  const userAgent = window.navigator.userAgent;
  const webSpatialVersion = getWebSpatialVersion(userAgent);
  if (window.navigator.userAgent.includes("Puppeteer")) {
    const PuppeteerPlatform2 = (init_PuppeteerPlatform(), __toCommonJS(PuppeteerPlatform_exports)).PuppeteerPlatform;
    return new PuppeteerPlatform2();
  } else if (userAgent.includes("PicoWebApp") && isVersionGreater(webSpatialVersion, [0, 0, 1])) {
    const XRPlatform2 = (init_XRPlatform(), __toCommonJS(XRPlatform_exports)).XRPlatform;
    return new XRPlatform2();
  } else if (userAgent.includes("Android") || userAgent.includes("Linux")) {
    const AndroidPlatform2 = (init_AndroidPlatform(), __toCommonJS(AndroidPlatform_exports)).AndroidPlatform;
    return new AndroidPlatform2();
  } else {
    const VisionOSPlatform2 = (init_VisionOSPlatform(), __toCommonJS(VisionOSPlatform_exports)).VisionOSPlatform;
    return new VisionOSPlatform2();
  }
}

// src/utils.ts
function parseBorderRadius(borderProperty, width) {
  if (borderProperty === "") {
    return 0;
  }
  if (borderProperty.endsWith("%")) {
    return width * parseFloat(borderProperty) / 100;
  }
  return parseFloat(borderProperty);
}
function parseCornerRadius(computedStyle) {
  const width = parseFloat(computedStyle.getPropertyValue("width"));
  const topLeftPropertyValue = computedStyle.getPropertyValue(
    "border-top-left-radius"
  );
  const topRightPropertyValue = computedStyle.getPropertyValue(
    "border-top-right-radius"
  );
  const bottomLeftPropertyValue = computedStyle.getPropertyValue(
    "border-bottom-left-radius"
  );
  const bottomRightPropertyValue = computedStyle.getPropertyValue(
    "border-bottom-right-radius"
  );
  const cornerRadius = {
    topLeading: parseBorderRadius(topLeftPropertyValue, width),
    bottomLeading: parseBorderRadius(bottomLeftPropertyValue, width),
    topTrailing: parseBorderRadius(topRightPropertyValue, width),
    bottomTrailing: parseBorderRadius(bottomRightPropertyValue, width)
  };
  return cornerRadius;
}
function composeSRT(position, rotation, scale) {
  const { x: px, y: py, z: pz } = position;
  const { x: rx, y: ry, z: rz } = rotation;
  const { x: sx, y: sy, z: sz } = scale;
  let m = new DOMMatrix();
  m = m.translate(px, py, pz);
  m = m.rotate(rx, ry, rz);
  m = m.scale(sx, sy, sz);
  return m;
}

// src/JSBCommand.ts
var platform = createPlatform();
var JSBCommand = class {
  commandType = "";
  async execute() {
    const param = this.getParams();
    const msg = param ? JSON.stringify(param) : "";
    return platform.callJSB(this.commandType, msg);
  }
};
var UpdateEntityPropertiesCommand = class extends JSBCommand {
  constructor(entity, properties) {
    super();
    this.entity = entity;
    this.properties = properties;
  }
  commandType = "UpdateEntityProperties";
  getParams() {
    const transform = composeSRT(
      this.properties.position ?? this.entity.position,
      this.properties.rotation ?? this.entity.rotation,
      this.properties.scale ?? this.entity.scale
    ).toFloat64Array();
    return {
      entityId: this.entity.id,
      transform
    };
  }
};
var UpdateEntityEventCommand = class extends JSBCommand {
  constructor(entity, type, isEnable) {
    super();
    this.entity = entity;
    this.type = type;
    this.isEnable = isEnable;
  }
  commandType = "UpdateEntityEvent";
  getParams() {
    return {
      type: this.type,
      entityId: this.entity.id,
      isEnable: this.isEnable
    };
  }
};
var UpdateSpatialSceneProperties = class extends JSBCommand {
  properties;
  commandType = "UpdateSpatialSceneProperties";
  constructor(properties) {
    super();
    this.properties = properties;
  }
  getParams() {
    return this.properties;
  }
};
var UpdateSceneConfig = class extends JSBCommand {
  config;
  commandType = "UpdateSceneConfig";
  constructor(config) {
    super();
    this.config = config;
  }
  getParams() {
    return { config: this.config };
  }
};
var FocusScene = class extends JSBCommand {
  constructor(id) {
    super();
    this.id = id;
  }
  commandType = "FocusScene";
  getParams() {
    return { id: this.id };
  }
};
var GetSpatialSceneState = class extends JSBCommand {
  commandType = "GetSpatialSceneState";
  constructor() {
    super();
  }
  getParams() {
    return {};
  }
};
var SpatializedElementCommand = class extends JSBCommand {
  constructor(spatialObject) {
    super();
    this.spatialObject = spatialObject;
  }
  getParams() {
    const extraParams = this.getExtraParams();
    return { id: this.spatialObject.id, ...extraParams };
  }
};
var UpdateSpatialized2DElementProperties = class extends SpatializedElementCommand {
  properties;
  commandType = "UpdateSpatialized2DElementProperties";
  constructor(spatialObject, properties) {
    super(spatialObject);
    this.properties = properties;
  }
  getExtraParams() {
    return this.properties;
  }
};
var UpdateSpatializedDynamic3DElementProperties = class extends SpatializedElementCommand {
  properties;
  commandType = "UpdateSpatializedDynamic3DElementProperties";
  constructor(spatialObject, properties) {
    super(spatialObject);
    this.properties = properties;
  }
  getExtraParams() {
    return {
      id: this.spatialObject.id,
      ...this.properties
    };
  }
};
var UpdateUnlitMaterialProperties = class extends SpatializedElementCommand {
  properties;
  commandType = "UpdateUnlitMaterialProperties";
  constructor(spatialObject, properties) {
    super(spatialObject);
    this.properties = properties;
  }
  getExtraParams() {
    return this.properties;
  }
};
var UpdateSpatializedElementTransform = class extends SpatializedElementCommand {
  matrix;
  commandType = "UpdateSpatializedElementTransform";
  constructor(spatialObject, matrix) {
    super(spatialObject);
    this.matrix = matrix;
  }
  getExtraParams() {
    return { matrix: Array.from(this.matrix.toFloat64Array()) };
  }
};
var UpdateSpatializedStatic3DElementProperties = class extends SpatializedElementCommand {
  properties;
  commandType = "UpdateSpatializedStatic3DElementProperties";
  constructor(spatialObject, properties) {
    super(spatialObject);
    this.properties = properties;
  }
  getExtraParams() {
    return this.properties;
  }
};
var AddSpatializedElementToSpatialized2DElement = class extends SpatializedElementCommand {
  commandType = "AddSpatializedElementToSpatialized2DElement";
  spatializedElement;
  constructor(spatialObject, spatializedElement) {
    super(spatialObject);
    this.spatializedElement = spatializedElement;
  }
  getExtraParams() {
    return { spatializedElementId: this.spatializedElement.id };
  }
};
var AddSpatializedElementToSpatialScene = class extends JSBCommand {
  commandType = "AddSpatializedElementToSpatialScene";
  spatializedElement;
  constructor(spatializedElement) {
    super();
    this.spatializedElement = spatializedElement;
  }
  getParams() {
    return {
      spatializedElementId: this.spatializedElement.id
    };
  }
};
var CreateSpatializedStatic3DElementCommand = class extends JSBCommand {
  constructor(modelURL) {
    super();
    this.modelURL = modelURL;
    this.modelURL = modelURL;
  }
  commandType = "CreateSpatializedStatic3DElement";
  getParams() {
    return { modelURL: this.modelURL };
  }
};
var CreateSpatializedDynamic3DElementCommand = class extends JSBCommand {
  getParams() {
    return { test: true };
  }
  commandType = "CreateSpatializedDynamic3DElement";
};
var CreateSpatialEntityCommand = class extends JSBCommand {
  constructor(name) {
    super();
    this.name = name;
  }
  getParams() {
    return { name: this.name };
  }
  commandType = "CreateSpatialEntity";
};
var CreateModelComponentCommand = class extends JSBCommand {
  constructor(options) {
    super();
    this.options = options;
  }
  getParams() {
    let geometryId = this.options.mesh.id;
    let materialIds = this.options.materials.map((material) => material.id);
    return { geometryId, materialIds };
  }
  commandType = "CreateModelComponent";
};
var CreateSpatialModelEntityCommand = class extends JSBCommand {
  constructor(options) {
    super();
    this.options = options;
  }
  getParams() {
    return this.options;
  }
  commandType = "CreateSpatialModelEntity";
};
var CreateModelAssetCommand = class extends JSBCommand {
  constructor(options) {
    super();
    this.options = options;
  }
  getParams() {
    return { url: this.options.url };
  }
  commandType = "CreateModelAsset";
};
var CreateSpatialGeometryCommand = class extends JSBCommand {
  constructor(type, options = {}) {
    super();
    this.type = type;
    this.options = options;
  }
  getParams() {
    return { type: this.type, ...this.options };
  }
  commandType = "CreateGeometry";
};
var CreateSpatialUnlitMaterialCommand = class extends JSBCommand {
  constructor(options) {
    super();
    this.options = options;
  }
  getParams() {
    return this.options;
  }
  commandType = "CreateUnlitMaterial";
};
var AddComponentToEntityCommand = class extends JSBCommand {
  constructor(entity, comp) {
    super();
    this.entity = entity;
    this.comp = comp;
  }
  getParams() {
    return {
      entityId: this.entity.id,
      componentId: this.comp.id
    };
  }
  commandType = "AddComponentToEntity";
};
var SetParentForEntityCommand = class extends JSBCommand {
  // childId, parentId
  constructor(childId, parentId) {
    super();
    this.childId = childId;
    this.parentId = parentId;
  }
  getParams() {
    return {
      childId: this.childId,
      parentId: this.parentId
    };
  }
  commandType = "SetParentToEntity";
};
var ConvertFromEntityToEntityCommand = class extends JSBCommand {
  constructor(fromEntityId, toEntityId, fromPosition) {
    super();
    this.fromEntityId = fromEntityId;
    this.toEntityId = toEntityId;
    this.fromPosition = fromPosition;
  }
  getParams() {
    return {
      fromEntityId: this.fromEntityId,
      toEntityId: this.toEntityId,
      position: this.fromPosition
    };
  }
  commandType = "ConvertFromEntityToEntity";
};
var ConvertFromEntityToSceneCommand = class extends JSBCommand {
  constructor(fromEntityId, position) {
    super();
    this.fromEntityId = fromEntityId;
    this.position = position;
  }
  getParams() {
    return {
      fromEntityId: this.fromEntityId,
      position: this.position
    };
  }
  commandType = "ConvertFromEntityToScene";
};
var ConvertFromSceneToEntityCommand = class extends JSBCommand {
  //  let entityId: String
  // let position:Vec3
  constructor(entityId, position) {
    super();
    this.entityId = entityId;
    this.position = position;
  }
  getParams() {
    return {
      entityId: this.entityId,
      position: this.position
    };
  }
  commandType = "ConvertFromSceneToEntity";
};
var InspectCommand = class extends JSBCommand {
  constructor(id = "") {
    super();
    this.id = id;
  }
  commandType = "Inspect";
  getParams() {
    return this.id ? { id: this.id } : { id: "" };
  }
};
var DestroyCommand = class extends JSBCommand {
  constructor(id) {
    super();
    this.id = id;
  }
  commandType = "Destroy";
  getParams() {
    return { id: this.id };
  }
};
var WebSpatialProtocolCommand = class extends JSBCommand {
  target;
  features;
  async execute() {
    const query = this.getQuery();
    return platform.callWebSpatialProtocol(
      this.commandType,
      query,
      this.target,
      this.features
    );
  }
  executeSync() {
    const query = this.getQuery();
    return platform.callWebSpatialProtocolSync(
      this.commandType,
      query,
      this.target,
      this.features
    );
  }
  getQuery() {
    let query = void 0;
    const params = this.getParams();
    if (params) {
      query = Object.keys(params).map((key) => {
        const value = params[key];
        const finalValue = typeof value === "object" ? JSON.stringify(value) : value;
        return `${key}=${encodeURIComponent(finalValue)}`;
      }).join("&");
    }
    return query;
  }
};
var createSpatialized2DElementCommand = class extends WebSpatialProtocolCommand {
  commandType = "createSpatialized2DElement";
  constructor() {
    super();
  }
  getParams() {
    return {};
  }
};
var createSpatialSceneCommand = class extends WebSpatialProtocolCommand {
  constructor(url, config, target, features) {
    super();
    this.url = url;
    this.config = config;
    this.target = target;
    this.features = features;
  }
  commandType = "createSpatialScene";
  getParams() {
    return {
      url: this.url,
      config: this.config
    };
  }
};
var CreateAttachmentEntityCommand = class extends WebSpatialProtocolCommand {
  constructor(options) {
    super();
    this.options = options;
  }
  commandType = "createAttachment";
  getParams() {
    return {
      parentEntityId: this.options.parentEntityId,
      position: this.options.position ?? [0, 0, 0],
      size: this.options.size
    };
  }
};
var UpdateAttachmentEntityCommand = class extends JSBCommand {
  constructor(attachmentId, options) {
    super();
    this.attachmentId = attachmentId;
    this.options = options;
  }
  commandType = "UpdateAttachmentEntity";
  getParams() {
    return {
      id: this.attachmentId,
      ...this.options
    };
  }
};

// src/SpatialObject.ts
var SpatialObject = class {
  /** @hidden */
  constructor(id) {
    this.id = id;
  }
  name;
  isDestroyed = false;
  async inspect() {
    const ret = await new InspectCommand(this.id).execute();
    if (ret.success) {
      return ret.data;
    }
    throw new Error(ret.errorMessage);
  }
  async destroy() {
    if (this.isDestroyed) {
      return;
    }
    const ret = await new DestroyCommand(this.id).execute();
    if (ret.success) {
      this.onDestroy();
      this.isDestroyed = true;
      return ret.data;
    } else if (this.isDestroyed) {
      return;
    }
    throw new Error(ret.errorMessage);
  }
  // override this method to do some cleanup
  onDestroy() {
  }
};

// src/SpatialScene.ts
var instance;
var SpatialScene = class _SpatialScene extends SpatialObject {
  /**
   * Gets the singleton instance of the SpatialScene.
   * Creates a new instance if one doesn't exist yet.
   * @returns The singleton SpatialScene instance
   */
  static getInstance() {
    if (!instance) {
      instance = new _SpatialScene("");
    }
    return instance;
  }
  /**
   * Updates the properties of the spatial scene.
   * This can include background settings, lighting, and other scene-wide properties.
   * @param properties Partial set of properties to update
   * @returns Promise resolving when the update is complete
   */
  async updateSpatialProperties(properties) {
    return new UpdateSpatialSceneProperties(properties).execute();
  }
  /**
   * Adds a spatialized element to the scene.
   * This makes the element visible and interactive in the spatial environment.
   * @param element The SpatializedElement to add to the scene
   * @returns Promise resolving when the element is added
   */
  async addSpatializedElement(element) {
    return new AddSpatializedElementToSpatialScene(element).execute();
  }
  /**
   * Updates the scene creation configuration.
   * This allows changing scene parameters after initial creation.
   * @param config The new scene creation configuration
   * @returns Promise resolving when the update is complete
   */
  async updateSceneCreationConfig(config) {
    return new UpdateSceneConfig(config).execute();
  }
  /**
   * Gets the current state of the spatial scene.
   * This includes information about active elements and scene configuration.
   * @returns Promise resolving to the current SpatialSceneState
   */
  async getState() {
    return (await new GetSpatialSceneState().execute()).data.name;
  }
};

// src/types/types.ts
var SpatializedElementType = /* @__PURE__ */ ((SpatializedElementType2) => {
  SpatializedElementType2[SpatializedElementType2["Spatialized2DElement"] = 0] = "Spatialized2DElement";
  SpatializedElementType2[SpatializedElementType2["SpatializedStatic3DElement"] = 1] = "SpatializedStatic3DElement";
  SpatializedElementType2[SpatializedElementType2["SpatializedDynamic3DElement"] = 2] = "SpatializedDynamic3DElement";
  return SpatializedElementType2;
})(SpatializedElementType || {});
var BaseplateVisibilityValues = [
  "automatic",
  "visible",
  "hidden"
];
function isValidBaseplateVisibilityType(type) {
  return BaseplateVisibilityValues.includes(type);
}
var WorldScalingValues = ["automatic", "dynamic"];
function isValidWorldScalingType(type) {
  return WorldScalingValues.includes(type);
}
var WorldAlignmentValues = [
  "adaptive",
  "automatic",
  "gravityAligned"
];
function isValidWorldAlignmentType(type) {
  return WorldAlignmentValues.includes(type);
}
var SpatialSceneValues = ["window", "volume"];
function isValidSpatialSceneType(type) {
  return SpatialSceneValues.includes(type);
}
function isValidSceneUnit(val) {
  if (typeof val === "number") {
    return val >= 0;
  }
  if (typeof val === "string") {
    if (val.endsWith("px")) {
      if (isNaN(Number(val.slice(0, -2)))) {
        return false;
      }
      return Number(val.slice(0, -2)) >= 0;
    }
    if (val.endsWith("m")) {
      if (isNaN(Number(val.slice(0, -1)))) {
        return false;
      }
      return Number(val.slice(0, -1)) >= 0;
    }
  }
  return false;
}
var SpatialSceneState = /* @__PURE__ */ ((SpatialSceneState2) => {
  SpatialSceneState2["idle"] = "idle";
  SpatialSceneState2["pending"] = "pending";
  SpatialSceneState2["willVisible"] = "willVisible";
  SpatialSceneState2["visible"] = "visible";
  SpatialSceneState2["fail"] = "fail";
  return SpatialSceneState2;
})(SpatialSceneState || {});
var CubeInfo = class {
  constructor(size, origin) {
    this.size = size;
    this.origin = origin;
    this.size = size;
    this.origin = origin;
  }
  get x() {
    return this.origin.x;
  }
  get y() {
    return this.origin.y;
  }
  get z() {
    return this.origin.z;
  }
  get width() {
    return this.size.width;
  }
  get height() {
    return this.size.height;
  }
  get depth() {
    return this.size.depth;
  }
  get left() {
    return this.x;
  }
  get top() {
    return this.y;
  }
  get right() {
    return this.x + this.width;
  }
  get bottom() {
    return this.y + this.height;
  }
  get back() {
    return this.z;
  }
  get front() {
    return this.z + this.depth;
  }
};

// src/scene-polyfill.ts
var defaultSceneConfig = {
  defaultSize: {
    width: 1280,
    height: 720
  }
};
var defaultSceneConfigVolume = {
  defaultSize: {
    width: 0.94,
    height: 0.94,
    depth: 0.94
  }
};
var INTERNAL_SCHEMA_PREFIX = "webspatial://";
var SceneManager = class _SceneManager {
  originalOpen;
  static instance;
  static getInstance() {
    if (!_SceneManager.instance) {
      _SceneManager.instance = new _SceneManager();
    }
    return _SceneManager.instance;
  }
  init(window2) {
    this.originalOpen = window2.open.bind(window2);
    window2.open = this.open;
  }
  configMap = {};
  // name=>config
  getConfig(name) {
    if (name === void 0 || !this.configMap[name]) return void 0;
    return this.configMap[name];
  }
  // Ensure URL is absolute; only convert when a relative path is provided
  // - Keep external and special schemes untouched (http, https, data, blob, about, file, mailto, etc.)
  // - Handle protocol-relative URLs (//example.com/path)
  // - Resolve relative paths against document.baseURI (respects <base href>)
  ensureAbsoluteUrl(raw) {
    if (!raw) return raw;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
      return raw;
    }
    if (raw.startsWith("//")) {
      return `${window.location.protocol}${raw}`;
    }
    try {
      return new URL(raw, document.baseURI).toString();
    } catch {
      return raw;
    }
  }
  open = (url, target, features) => {
    if (url?.startsWith(INTERNAL_SCHEMA_PREFIX)) {
      return this.originalOpen(url, target, features);
    }
    url = this.ensureAbsoluteUrl(url);
    if (target === "_self" || target === "_parent" || target === "_top") {
      const newWindow = this.originalOpen(url, target, features);
      return newWindow;
    }
    const cfg = target ? this.getConfig(target) : void 0;
    const cmd = new createSpatialSceneCommand(url, cfg, target, features);
    const result = cmd.executeSync();
    const id = result.data?.id;
    if (id) {
      let focusCmd = new FocusScene(id);
      focusCmd.execute();
    }
    return result.data?.windowProxy;
  };
  initScene(name, callback, options) {
    const sceneType = options?.type ?? "window";
    const defaultConfig = getSceneDefaultConfig(sceneType);
    const rawReturnVal = callback({ ...defaultConfig });
    const [formattedConfig, errors] = formatSceneConfig(rawReturnVal, sceneType);
    if (errors.length > 0) {
      console.warn(`initScene ${name} with errors: ${errors.join(", ")}`);
    }
    this.configMap[name] = {
      ...formattedConfig,
      type: sceneType
    };
  }
};
function pxToMeter(px) {
  return px / 1360;
}
function meterToPx(meter) {
  return meter * 1360;
}
function formatToNumber(str, targetUnit, defaultUnit) {
  if (typeof str === "number") {
    if (defaultUnit === "px" && targetUnit === "px" || defaultUnit === "m" && targetUnit === "m") {
      return str;
    }
    if (defaultUnit === "px" && targetUnit === "m") {
      return pxToMeter(str);
    } else if (defaultUnit === "m" && targetUnit === "px") {
      return meterToPx(str);
    }
    return str;
  }
  if (targetUnit === "m") {
    if (str.endsWith("m")) {
      return Number(str.slice(0, -1));
    } else if (str.endsWith("px")) {
      return pxToMeter(Number(str.slice(0, -2)));
    } else {
      throw new Error("formatToNumber: invalid str");
    }
  } else if (targetUnit === "px") {
    if (str.endsWith("px")) {
      return Number(str.slice(0, -2));
    } else if (str.endsWith("m")) {
      return meterToPx(Number(str.slice(0, -1)));
    } else {
      throw new Error("formatToNumber: invalid str");
    }
  } else {
    throw new Error("formatToNumber: invalid targetUnit");
  }
}
function formatSceneConfig(config, sceneType) {
  const defaultSceneConfig2 = getSceneDefaultConfig(sceneType);
  const errors = [];
  const isWindow = sceneType === "window";
  if (!isValidSpatialSceneType(sceneType)) {
    errors.push(`sceneType`);
  }
  if (config.defaultSize) {
    const iterKeys = ["width", "height", "depth"];
    for (let k of iterKeys) {
      if (!(k in config.defaultSize)) continue;
      if (isValidSceneUnit(config.defaultSize[k])) {
        ;
        config.defaultSize[k] = formatToNumber(
          config.defaultSize[k],
          isWindow ? "px" : "m",
          isWindow ? "px" : "m"
        );
      } else {
        ;
        config.defaultSize[k] = defaultSceneConfig2.defaultSize[k];
        errors.push(`defaultSize.${k}`);
      }
    }
  }
  if (config.resizability) {
    const iterKeys = ["minWidth", "minHeight", "maxWidth", "maxHeight"];
    for (let k of iterKeys) {
      if (!(k in config.resizability)) continue;
      if (isValidSceneUnit(config.resizability[k])) {
        ;
        config.resizability[k] = formatToNumber(
          config.resizability[k],
          "px",
          isWindow ? "px" : "m"
        );
      } else {
        ;
        config.resizability[k] = void 0;
        errors.push(`resizability.${k}`);
      }
    }
  }
  if (config.worldScaling) {
    if (!isValidWorldScalingType(config.worldScaling)) {
      config.worldScaling = "automatic";
      errors.push("worldScaling");
    }
  }
  if (config.worldAlignment) {
    if (!isValidWorldAlignmentType(config.worldAlignment)) {
      config.worldAlignment = "automatic";
      errors.push("worldAlignment");
    }
  }
  if (config.baseplateVisibility) {
    if (!isValidBaseplateVisibilityType(config.baseplateVisibility)) {
      config.baseplateVisibility = "automatic";
      errors.push("baseplateVisibility");
    }
  }
  return [config, errors];
}
function initScene(name, callback, options) {
  return SceneManager.getInstance().initScene(name, callback, options);
}
function hijackWindowOpen(window2) {
  SceneManager.getInstance().init(window2);
}
function hijackWindowATag(openedWindow) {
  openedWindow.document.onclick = function(e) {
    let element = e.target;
    let found = false;
    while (!found) {
      if (element && element.tagName == "A") {
        if (handleATag(e)) {
          return false;
        }
        return true;
      }
      if (element && element.parentElement) {
        element = element.parentElement;
      } else {
        break;
      }
    }
  };
}
function handleATag(event) {
  const targetElement = event.target;
  if (targetElement.tagName === "A") {
    const link = targetElement;
    const target = link.target;
    const url = link.href;
    if (target && target !== "_self") {
      event.preventDefault();
      window.open(url, target);
      return true;
    }
  }
}
function getSceneDefaultConfig(sceneType) {
  return sceneType === "window" ? defaultSceneConfig : defaultSceneConfigVolume;
}
async function injectScenePolyfill() {
  if (!window.opener) return;
  const state = await SpatialScene.getInstance().getState();
  if (state !== "pending" /* pending */) return;
  function onContentLoaded(callback) {
    if (document.readyState === "interactive" || document.readyState === "complete") {
      callback();
    } else {
      document.addEventListener("DOMContentLoaded", callback);
    }
  }
  onContentLoaded(async () => {
    let provideDefaultSceneConfig = getSceneDefaultConfig(
      window.xrCurrentSceneType ?? "window"
    );
    let cfg = provideDefaultSceneConfig;
    if (typeof window.xrCurrentSceneDefaults === "function") {
      try {
        cfg = await window.xrCurrentSceneDefaults?.(provideDefaultSceneConfig);
      } catch (error) {
        console.error(error);
      }
    }
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(null);
      }, 1e3);
    });
    const sceneType = window.xrCurrentSceneType ?? "window";
    const [formattedConfig, errors] = formatSceneConfig(cfg, sceneType);
    if (errors.length > 0) {
      console.warn(
        `window.xrCurrentSceneDefaults with errors: ${errors.join(", ")}`
      );
    }
    await SpatialScene.getInstance().updateSceneCreationConfig({
      ...formattedConfig,
      type: sceneType
    });
  });
}
function injectSceneHook() {
  hijackWindowOpen(window);
  hijackWindowATag(window);
  injectScenePolyfill();
}

// src/SpatializedElement.ts
init_SpatialWebEvent();

// src/SpatialWebEventCreator.ts
function createSpatialEvent(type, detail) {
  return new CustomEvent(type, {
    bubbles: true,
    cancelable: false,
    detail
  });
}

// src/SpatializedElement.ts
var SpatializedElement = class extends SpatialObject {
  /**
   * Creates a new spatialized element with the specified ID.
   * Registers the element to receive spatial events.
   * @param id Unique identifier for this element
   */
  constructor(id) {
    super(id);
    this.id = id;
    SpatialWebEvent.addEventReceiver(id, this.onReceiveEvent.bind(this));
  }
  /**
   * Updates the transformation matrix of this element in 3D space.
   * This affects the position, rotation, and scale of the element.
   * @param matrix The new transformation matrix
   * @returns Promise resolving when the transform is updated
   */
  async updateTransform(matrix) {
    return new UpdateSpatializedElementTransform(this, matrix).execute();
  }
  /**
   * Information about the element's bounding cube.
   * Used for spatial calculations and hit testing.
   */
  _cubeInfo;
  /**
   * Gets the current cube information for this element.
   * @returns The current CubeInfo or undefined if not set
   */
  get cubeInfo() {
    return this._cubeInfo;
  }
  /**
   * The current transformation matrix of this element.
   */
  _transform;
  /**
   * The inverse of the current transformation matrix.
   * Used for converting world coordinates to local coordinates.
   */
  _transformInv;
  /**
   * Gets the current transformation matrix.
   * @returns The current transformation matrix or undefined if not set
   */
  get transform() {
    return this._transform;
  }
  /**
   * Gets the inverse of the current transformation matrix.
   * @returns The inverse transformation matrix or undefined if not set
   */
  get transformInv() {
    return this._transformInv;
  }
  /**
   * Processes events received from the WebSpatial environment.
   * Handles various spatial events like transforms, gestures, and interactions.
   * @param data The event data received from the WebSpatial system
   */
  onReceiveEvent(data) {
    const { type } = data;
    if (type === "objectdestroy" /* objectdestroy */) {
      this.isDestroyed = true;
    } else if (type === "cubeInfo" /* cubeInfo */) {
      const cubeInfoMsg = data;
      this._cubeInfo = new CubeInfo(cubeInfoMsg.size, cubeInfoMsg.origin);
    } else if (type === "transform" /* transform */) {
      this._transform = new DOMMatrix([
        data.detail.column0[0],
        data.detail.column0[1],
        data.detail.column0[2],
        0,
        data.detail.column1[0],
        data.detail.column1[1],
        data.detail.column1[2],
        0,
        data.detail.column2[0],
        data.detail.column2[1],
        data.detail.column2[2],
        0,
        data.detail.column3[0],
        data.detail.column3[1],
        data.detail.column3[2],
        1
      ]);
      this._transformInv = this._transform.inverse();
    } else if (type === "spatialtap" /* spatialtap */) {
      const event = createSpatialEvent(
        "spatialtap" /* spatialtap */,
        data.detail
      );
      this._onSpatialTap?.(event);
    } else if (type === "spatialdragstart" /* spatialdragstart */) {
      const dragStartEvent = createSpatialEvent(
        "spatialdragstart" /* spatialdragstart */,
        data.detail
      );
      this._onSpatialDragStart?.(dragStartEvent);
    } else if (type === "spatialdrag" /* spatialdrag */) {
      const event = createSpatialEvent(
        "spatialdrag" /* spatialdrag */,
        data.detail
      );
      this._onSpatialDrag?.(event);
    } else if (type === "spatialdragend" /* spatialdragend */) {
      const event = createSpatialEvent(
        "spatialdragend" /* spatialdragend */,
        data.detail
      );
      this._onSpatialDragEnd?.(event);
    } else if (type === "spatialrotate" /* spatialrotate */) {
      const event = createSpatialEvent(
        "spatialrotate" /* spatialrotate */,
        data.detail
      );
      this._onSpatialRotate?.(event);
    } else if (type === "spatialrotateend" /* spatialrotateend */) {
      const event = createSpatialEvent(
        "spatialrotateend" /* spatialrotateend */,
        data.detail
      );
      this._onSpatialRotateEnd?.(event);
    } else if (type === "spatialmagnify" /* spatialmagnify */) {
      const event = createSpatialEvent(
        "spatialmagnify" /* spatialmagnify */,
        data.detail
      );
      this._onSpatialMagnify?.(event);
    } else if (type === "spatialmagnifyend" /* spatialmagnifyend */) {
      const event = createSpatialEvent(
        "spatialmagnifyend" /* spatialmagnifyend */,
        data.detail
      );
      this._onSpatialMagnifyEnd?.(event);
    }
  }
  _onSpatialTap;
  set onSpatialTap(value) {
    this._onSpatialTap = value;
    this.updateProperties({
      enableTapGesture: value !== void 0
    });
  }
  _onSpatialDragStart;
  set onSpatialDragStart(value) {
    this._onSpatialDragStart = value;
    this.updateProperties({
      enableDragStartGesture: this._onSpatialDragStart !== void 0
    });
  }
  _onSpatialDrag;
  set onSpatialDrag(value) {
    this._onSpatialDrag = value;
    this.updateProperties({
      enableDragGesture: this._onSpatialDrag !== void 0
    });
  }
  _onSpatialDragEnd;
  set onSpatialDragEnd(value) {
    this._onSpatialDragEnd = value;
    this.updateProperties({
      enableDragEndGesture: value !== void 0
    });
  }
  _onSpatialRotate;
  set onSpatialRotate(value) {
    this._onSpatialRotate = value;
    this.updateProperties({
      enableRotateGesture: this._onSpatialRotate !== void 0
    });
  }
  _onSpatialRotateEnd;
  set onSpatialRotateEnd(value) {
    this._onSpatialRotateEnd = value;
    this.updateProperties({
      enableRotateEndGesture: value !== void 0
    });
  }
  _onSpatialMagnify;
  set onSpatialMagnify(value) {
    this._onSpatialMagnify = value;
    this.updateProperties({
      enableMagnifyGesture: value !== void 0
    });
  }
  _onSpatialMagnifyEnd;
  set onSpatialMagnifyEnd(value) {
    this._onSpatialMagnifyEnd = value;
    this.updateProperties({
      enableMagnifyEndGesture: value !== void 0
    });
  }
  /**
   * Cleans up resources when this element is destroyed.
   * Removes event receivers to prevent memory leaks.
   */
  onDestroy() {
    SpatialWebEvent.removeEventReceiver(this.id);
  }
};

// src/Spatialized2DElement.ts
var Spatialized2DElement = class extends SpatializedElement {
  /**
   * Creates a new spatialized 2D element.
   * @param id Unique identifier for this element
   * @param windowProxy Reference to the window object containing the 2D content
   */
  constructor(id, windowProxy) {
    super(id);
    this.windowProxy = windowProxy;
    hijackWindowATag(windowProxy);
  }
  /**
   * Updates the properties of this 2D element.
   * This can include size, position, background, and other visual properties.
   * @param properties Partial set of properties to update
   * @returns Promise resolving when the update is complete
   */
  async updateProperties(properties) {
    return new UpdateSpatialized2DElementProperties(this, properties).execute();
  }
  /**
   * Adds a child spatialized element to this 2D element.
   * This allows for creating hierarchical structures of spatial elements.
   * @param element The child element to add
   * @returns Promise resolving when the element is added
   */
  async addSpatializedElement(element) {
    return new AddSpatializedElementToSpatialized2DElement(
      this,
      element
    ).execute();
  }
};

// src/SpatializedStatic3DElement.ts
var SpatializedStatic3DElement = class extends SpatializedElement {
  /**
   * Creates a new spatialized static 3D element with the specified ID and URL.
   * Registers the element to receive spatial events.
   * @param id Unique identifier for this element
   * @param modelURL URL of the 3D model
   */
  constructor(id, modelURL) {
    super(id);
    this.modelURL = modelURL;
  }
  /**
   * Promise resolver for the ready state.
   * Used to resolve the ready promise when the model is loaded.
   */
  _readyResolve;
  /**
   * Caches the last model URL to detect changes.
   * Used to reset the ready promise when the model URL changes.
   */
  modelURL;
  /**
   * Creates a new promise for tracking the ready state of the model.
   * @returns Promise that resolves when the model is loaded (true) or fails to load (false)
   */
  createReadyPromise() {
    return new Promise((resolve) => {
      this._readyResolve = resolve;
    });
  }
  /**
   * Promise that resolves when the model is loaded.
   * Resolves to true on successful load, false on failure.
   */
  ready = this.createReadyPromise();
  /**
   * Updates the properties of this static 3D element.
   * Handles special case for modelURL changes by resetting the ready promise.
   * @param properties Partial set of properties to update
   * @returns Promise resolving when the update is complete
   */
  async updateProperties(properties) {
    if (properties.modelURL !== void 0) {
      if (this.modelURL !== properties.modelURL) {
        this.modelURL = properties.modelURL;
        this.ready = this.createReadyPromise();
      }
    }
    return new UpdateSpatializedStatic3DElementProperties(
      this,
      properties
    ).execute();
  }
  /**
   * Processes events received from the WebSpatial environment.
   * Handles model loading events in addition to base spatial events.
   * @param data The event data received from the WebSpatial system
   */
  onReceiveEvent(data) {
    if (data.type === "modelloaded" /* modelloaded */) {
      this._onLoadCallback?.();
      this._readyResolve?.(true);
    } else if (data.type === "modelloadfailed" /* modelloadfailed */) {
      this._onLoadFailureCallback?.();
      this._readyResolve?.(false);
    } else {
      super.onReceiveEvent(data);
    }
  }
  /**
   * Callback function for successful model loading.
   */
  _onLoadCallback;
  /**
   * Sets the callback function for successful model loading.
   * @param callback Function to call when the model is loaded successfully
   */
  set onLoadCallback(callback) {
    this._onLoadCallback = callback;
  }
  /**
   * Callback function for model loading failure.
   */
  _onLoadFailureCallback;
  /**
   * Sets the callback function for model loading failure.
   * @param callback Function to call when the model fails to load
   */
  set onLoadFailureCallback(callback) {
    this._onLoadFailureCallback = callback;
  }
  updateModelTransform(transform) {
    const modelTransform = Array.from(transform.toFloat64Array());
    this.updateProperties({ modelTransform });
  }
};

// src/SpatializedDynamic3DElement.ts
var SpatializedDynamic3DElement = class extends SpatializedElement {
  children = [];
  constructor(id) {
    super(id);
  }
  async addEntity(entity) {
    const ans = new SetParentForEntityCommand(entity.id, this.id).execute();
    this.children.push(entity);
    entity.parent = this;
    return ans;
  }
  async updateProperties(properties) {
    return new UpdateSpatializedDynamic3DElementProperties(
      this,
      properties
    ).execute();
  }
};

// src/SpatializedElementCreator.ts
async function createSpatialized2DElement() {
  const result = await new createSpatialized2DElementCommand().execute();
  if (!result.success) {
    throw new Error("createSpatialized2DElement failed");
  } else {
    const { id, windowProxy } = result.data;
    windowProxy.document.head.innerHTML = `<meta name="viewport" content="width=device-width, initial-scale=1">
      <base href="${document.baseURI}">`;
    return new Spatialized2DElement(id, windowProxy);
  }
}
async function createSpatializedStatic3DElement(modelURL) {
  const result = await new CreateSpatializedStatic3DElementCommand(
    modelURL
  ).execute();
  if (!result.success) {
    throw new Error("createSpatializedStatic3DElement failed");
  } else {
    const { id } = result.data;
    return new SpatializedStatic3DElement(id, modelURL);
  }
}
async function createSpatializedDynamic3DElement() {
  const result = await new CreateSpatializedDynamic3DElementCommand().execute();
  if (!result.success) {
    throw new Error("createSpatializedDynamic3DElement failed");
  } else {
    const { id } = result.data;
    return new SpatializedDynamic3DElement(id);
  }
}

// src/reality/Attachment.ts
var Attachment = class extends SpatialObject {
  constructor(id, windowProxy, options) {
    super(id);
    this.windowProxy = windowProxy;
    this.options = options;
  }
  getContainer() {
    return this.windowProxy.document.body;
  }
  getWindowProxy() {
    return this.windowProxy;
  }
  async update(options) {
    if (this.isDestroyed) return;
    if (options.position) this.options.position = options.position;
    if (options.size) this.options.size = options.size;
    return new UpdateAttachmentEntityCommand(this.id, options).execute();
  }
};
async function createAttachmentEntity(options) {
  const result = await new CreateAttachmentEntityCommand(options).execute();
  if (!result.success) {
    throw new Error("createAttachmentEntity failed: " + result?.errorMessage);
  }
  const { id, windowProxy } = result.data;
  return new Attachment(id, windowProxy, options);
}

// src/reality/entity/SpatialEntity.ts
init_SpatialWebEvent();
var SpatialEntity = class _SpatialEntity extends SpatialObject {
  constructor(id, userData) {
    super(id);
    this.userData = userData;
    SpatialWebEvent.addEventReceiver(id, this.onReceiveEvent);
  }
  position = { x: 0, y: 0, z: 0 };
  rotation = { x: 0, y: 0, z: 0 };
  scale = { x: 1, y: 1, z: 1 };
  events = {};
  children = [];
  parent = null;
  async addComponent(component) {
    return new AddComponentToEntityCommand(this, component).execute();
  }
  async setPosition(position) {
    return this.updateTransform({ position });
  }
  async setRotation(rotation) {
    return this.updateTransform({ rotation });
  }
  async setScale(scale) {
    return this.updateTransform({ scale });
  }
  async addEntity(ent) {
    const ans = await new SetParentForEntityCommand(ent.id, this.id).execute();
    this.children.push(ent);
    ent.parent = this;
    return ans;
  }
  async removeFromParent() {
    const ans = await new SetParentForEntityCommand(
      this.id,
      void 0
    ).execute();
    if (this.parent) {
      this.parent.children = this.parent.children.filter(
        (child) => child.id !== this.id
      );
      this.parent = null;
    }
    return ans;
  }
  async updateTransform(properties) {
    this.position = properties.position ?? this.position;
    this.rotation = properties.rotation ?? this.rotation;
    this.scale = properties.scale ?? this.scale;
    return new UpdateEntityPropertiesCommand(this, properties).execute();
  }
  async addEvent(type, callback) {
    if (this.events[type]) {
      this.events[type] = callback;
    } else {
      try {
        await this.updateEntityEvent(type, true);
        this.events[type] = callback;
      } catch (error) {
        console.error("addEvent failed", type);
      }
    }
  }
  async removeEvent(eventName) {
    if (this.events[eventName]) {
      delete this.events[eventName];
      try {
        await this.updateEntityEvent(eventName, false);
      } catch (error) {
        console.error("removeEvent failed", eventName);
      }
    }
  }
  async updateEntityEvent(eventName, isEnable) {
    return new UpdateEntityEventCommand(this, eventName, isEnable).execute();
  }
  onReceiveEvent = (data) => {
    const { type } = data;
    if (type === "objectdestroy" /* objectdestroy */) {
      this.isDestroyed = true;
    } else if (type === "spatialtap" /* spatialtap */) {
      const evt = createSpatialEvent(
        "spatialtap" /* spatialtap */,
        data.detail
      );
      this.dispatchEvent(evt);
    } else if (type === "spatialdragstart" /* spatialdragstart */) {
      const evt = createSpatialEvent(
        "spatialdragstart" /* spatialdragstart */,
        data.detail
      );
      this.dispatchEvent(evt);
    } else if (type === "spatialdrag" /* spatialdrag */) {
      const evt = createSpatialEvent(
        "spatialdrag" /* spatialdrag */,
        data.detail
      );
      this.dispatchEvent(evt);
    } else if (type === "spatialdragend" /* spatialdragend */) {
      const evt = createSpatialEvent(
        "spatialdragend" /* spatialdragend */,
        data.detail
      );
      this.dispatchEvent(evt);
    } else if (type === "spatialrotate" /* spatialrotate */) {
      const evt = createSpatialEvent(
        "spatialrotate" /* spatialrotate */,
        data.detail
      );
      this.dispatchEvent(evt);
    } else if (type === "spatialrotateend" /* spatialrotateend */) {
      const evt = createSpatialEvent(
        "spatialrotateend" /* spatialrotateend */,
        data.detail
      );
      this.dispatchEvent(evt);
    } else if (type === "spatialmagnify" /* spatialmagnify */) {
      const evt = createSpatialEvent(
        "spatialmagnify" /* spatialmagnify */,
        data.detail
      );
      this.dispatchEvent(evt);
    } else if (type === "spatialmagnifyend" /* spatialmagnifyend */) {
      const evt = createSpatialEvent(
        "spatialmagnifyend" /* spatialmagnifyend */,
        data.detail
      );
      this.dispatchEvent(evt);
    }
  };
  dispatchEvent(evt) {
    if (!evt.__origin) {
      Object.defineProperty(evt, "__origin", { value: this, enumerable: false });
    }
    this.events[evt.type]?.(evt);
    if (evt.bubbles && !evt.cancelBubble) {
      if (this.parent && this.parent instanceof _SpatialEntity) {
        this.parent.dispatchEvent(evt);
      }
    }
  }
  onDestroy() {
    SpatialWebEvent.removeEventReceiver(this.id);
    this.children.forEach((child) => {
      child.parent = null;
    });
    this.children = [];
    if (this.parent) {
      this.parent.children = this.parent.children.filter(
        (child) => child.id !== this.id
      );
      this.parent = null;
    }
  }
  // onUpdate(properties: SpatialEntityProperties) {
  //   this.position = properties.position
  //   this.rotation = properties.rotation
  //   this.scale = properties.scale
  // }
  async convertFromEntityToEntity(fromEntityId, toEntityId, position) {
    return new ConvertFromEntityToEntityCommand(
      fromEntityId,
      toEntityId,
      position
    ).execute();
  }
  async convertFromEntityToScene(fromEntityId, position) {
    return new ConvertFromEntityToSceneCommand(fromEntityId, position).execute();
  }
  async convertFromSceneToEntity(entityId, position) {
    return new ConvertFromSceneToEntityCommand(entityId, position).execute();
  }
};

// src/reality/entity/SpatialModelEntity.ts
var SpatialModelEntity = class extends SpatialEntity {
  constructor(id, options, userData) {
    super(id, userData);
    this.id = id;
    this.options = options;
    this.userData = userData;
  }
};

// src/reality/component/SpatialComponent.ts
init_SpatialWebEvent();
var SpatialComponent = class extends SpatialObject {
  constructor(id) {
    super(id);
    SpatialWebEvent.addEventReceiver(id, this.onReceiveEvent);
  }
  onReceiveEvent = (data) => {
    const { type } = data;
    if (type === "objectdestroy" /* objectdestroy */) {
      this.isDestroyed = true;
    }
  };
};

// src/reality/component/ModelComponent.ts
var ModelComponent = class extends SpatialComponent {
  constructor(id, options) {
    super(id);
    this.options = options;
  }
};

// src/reality/material/SpatialMaterial.ts
var SpatialMaterial = class extends SpatialObject {
  constructor(id, type) {
    super(id);
    this.id = id;
    this.type = type;
    this.type = type;
  }
};

// src/reality/material/SpatialUnlitMaterial.ts
var SpatialUnlitMaterial = class extends SpatialMaterial {
  constructor(id, options) {
    super(id, "unlit");
    this.id = id;
    this.options = options;
  }
  updateProperties(properties) {
    return new UpdateUnlitMaterialProperties(this, properties).execute();
  }
};

// src/reality/resource/SpatialModelAsset.ts
var SpatialModelAsset = class extends SpatialObject {
  constructor(id, options) {
    super(id);
    this.id = id;
    this.options = options;
  }
};

// src/reality/realityCreator.ts
async function createSpatialEntity(userData) {
  const result = await new CreateSpatialEntityCommand(userData?.name).execute();
  if (!result.success) {
    throw new Error("createSpatialEntity failed:" + result?.errorMessage);
  } else {
    const { id } = result.data;
    return new SpatialEntity(id, userData);
  }
}
async function createSpatialGeometry(ctor, options) {
  const result = await new CreateSpatialGeometryCommand(
    ctor.type,
    options
  ).execute();
  if (!result.success) {
    throw new Error("createSpatialGeometry failed:" + result?.errorMessage);
  } else {
    const { id } = result.data;
    return new ctor(id, options);
  }
}
async function createSpatialUnlitMaterial(options) {
  const result = await new CreateSpatialUnlitMaterialCommand(options).execute();
  if (!result.success) {
    throw new Error("createSpatialUnlitMaterial failed:" + result?.errorMessage);
  } else {
    const { id } = result.data;
    return new SpatialUnlitMaterial(id, options);
  }
}
async function createModelComponent(options) {
  const result = await new CreateModelComponentCommand(options).execute();
  if (!result.success) {
    throw new Error("createModelComponent failed:" + result?.errorMessage);
  } else {
    const { id } = result.data;
    return new ModelComponent(id, options);
  }
}
async function createSpatialModelEntity(options, userData) {
  const result = await new CreateSpatialModelEntityCommand(options).execute();
  if (!result.success) {
    throw new Error("createSpatialModelEntity failed:" + result?.errorMessage);
  } else {
    const { id } = result.data;
    return new SpatialModelEntity(id, options, userData);
  }
}
async function createModelAsset(options) {
  const result = await new CreateModelAssetCommand(options).execute();
  if (!result.success) {
    throw new Error("createModelAsset failed:" + result?.errorMessage);
  } else {
    const { id } = result.data;
    return new SpatialModelAsset(id, options);
  }
}

// src/reality/geometry/SpatialGeometry.ts
var SpatialGeometry = class extends SpatialObject {
  constructor(id, options) {
    super(id);
    this.id = id;
    this.options = options;
  }
  static type;
};

// src/reality/geometry/SpatialBoxGeometry.ts
var SpatialBoxGeometry = class extends SpatialGeometry {
  constructor(id, options) {
    super(id, options);
    this.id = id;
    this.options = options;
  }
  static type = "BoxGeometry";
};

// src/reality/geometry/SpatialSphereGeometry.ts
var SpatialSphereGeometry = class extends SpatialGeometry {
  constructor(id, options) {
    super(id, options);
    this.id = id;
    this.options = options;
  }
  static type = "SphereGeometry";
};

// src/reality/geometry/SpatialCylinderGeometry.ts
var SpatialCylinderGeometry = class extends SpatialGeometry {
  constructor(id, options) {
    super(id, options);
    this.id = id;
    this.options = options;
  }
  static type = "CylinderGeometry";
};

// src/reality/geometry/SpatialPlaneGeometry.ts
var SpatialPlaneGeometry = class extends SpatialGeometry {
  constructor(id, options) {
    super(id, options);
    this.id = id;
    this.options = options;
  }
  static type = "PlaneGeometry";
};

// src/reality/geometry/SpatialConeGeometry.ts
var SpatialConeGeometry = class extends SpatialGeometry {
  constructor(id, options) {
    super(id, options);
    this.id = id;
    this.options = options;
  }
  static type = "ConeGeometry";
};

// src/SpatialSession.ts
var SpatialSession = class {
  /**
   * Gets the singleton instance of the spatial scene.
   * The spatial scene is the root container for all spatial elements.
   * @returns The SpatialScene singleton instance
   */
  getSpatialScene() {
    return SpatialScene.getInstance();
  }
  /**
   * Creates a new 2D element that can be spatialized in the 3D environment.
   * 2D elements represent HTML content that can be positioned in 3D space.
   * @returns Promise resolving to a new Spatialized2DElement instance
   */
  createSpatialized2DElement() {
    return createSpatialized2DElement();
  }
  /**
   * Creates a new static 3D element with an optional model URL.
   * Static 3D elements represent pre-built 3D models that can be loaded from a URL.
   * @param modelURL Optional URL to the 3D model to load
   * @returns Promise resolving to a new SpatializedStatic3DElement instance
   */
  createSpatializedStatic3DElement(modelURL) {
    return createSpatializedStatic3DElement(modelURL);
  }
  /**
   * Initializes the spatial scene with custom configuration.
   * This is a reference to the initScene function from scene-polyfill.
   */
  initScene = initScene;
  /**
   * Creates a new dynamic 3D element that can be manipulated at runtime.
   * Dynamic 3D elements allow for programmatic creation and modification of 3D content.
   * @returns Promise resolving to a new SpatializedDynamic3DElement instance
   */
  createSpatializedDynamic3DElement() {
    return createSpatializedDynamic3DElement();
  }
  /**
   * Creates a new spatial entity with an optional name.
   * Entities are the basic building blocks for creating custom 3D content.
   * @param name Optional name for the entity
   * @returns Promise resolving to a new SpatialEntity instance
   */
  createEntity(userData) {
    return createSpatialEntity(userData);
  }
  /**
   * Creates a box geometry with optional configuration.
   * @param options Configuration options for the box geometry
   * @returns Promise resolving to a new SpatialBoxGeometry instance
   */
  createBoxGeometry(options = {}) {
    return createSpatialGeometry(SpatialBoxGeometry, options);
  }
  /**
   * Creates a plane geometry with optional configuration.
   * @param options Configuration options for the plane geometry
   * @returns Promise resolving to a new SpatialPlaneGeometry instance
   */
  createPlaneGeometry(options = {}) {
    return createSpatialGeometry(SpatialPlaneGeometry, options);
  }
  /**
   * Creates a sphere geometry with optional configuration.
   * @param options Configuration options for the sphere geometry
   * @returns Promise resolving to a new SpatialSphereGeometry instance
   */
  createSphereGeometry(options = {}) {
    return createSpatialGeometry(SpatialSphereGeometry, options);
  }
  /**
   * Creates a cone geometry with the specified configuration.
   * @param options Configuration options for the cone geometry
   * @returns Promise resolving to a new SpatialConeGeometry instance
   */
  createConeGeometry(options) {
    return createSpatialGeometry(SpatialConeGeometry, options);
  }
  /**
   * Creates a cylinder geometry with the specified configuration.
   * @param options Configuration options for the cylinder geometry
   * @returns Promise resolving to a new SpatialCylinderGeometry instance
   */
  createCylinderGeometry(options) {
    return createSpatialGeometry(SpatialCylinderGeometry, options);
  }
  /**
   * Creates a model component with the specified configuration.
   * Model components are used to add 3D model rendering capabilities to entities.
   * @param options Configuration options for the model component
   * @returns Promise resolving to a new ModelComponent instance
   */
  createModelComponent(options) {
    return createModelComponent(options);
  }
  /**
   * Creates an unlit material with the specified configuration.
   * Unlit materials don't respond to lighting in the scene.
   * @param options Configuration options for the unlit material
   * @returns Promise resolving to a new SpatialUnlitMaterial instance
   */
  createUnlitMaterial(options) {
    return createSpatialUnlitMaterial(options);
  }
  /**
   * Creates a model asset with the specified configuration.
   * Model assets represent 3D model resources that can be used by entities.
   * @param options Configuration options for the model asset
   * @returns Promise resolving to a new SpatialModelAsset instance
   */
  createModelAsset(options) {
    return createModelAsset(options);
  }
  /**
   * Creates a spatial model entity with the specified configuration.
   * This is a convenience method for creating an entity with a model component.
   * @param options Configuration options for the spatial model entity
   * @returns Promise resolving to a new SpatialModelEntity instance
   */
  createSpatialModelEntity(options, userData) {
    return createSpatialModelEntity(options, userData);
  }
  /**
   * Creates an attachment entity that renders 2D HTML content as a child
   * of a 3D entity in the scene graph.
   * @param options Configuration options including parent entity ID, position, and size
   * @returns Promise resolving to a new Attachment instance
   */
  createAttachmentEntity(options) {
    return createAttachmentEntity(options);
  }
};

// src/Spatial.ts
init_SpatialWebEvent();
var Spatial = class {
  /**
   * Requests a spatial session object from the browser.
   * This is the primary method to initialize spatial functionality.
   * @returns The SpatialSession instance or null if not available in the current browser
   * [TODO] discuss implications of this not being async
   */
  requestSession() {
    if (this.runInSpatialWeb()) {
      SpatialWebEvent.init();
      return new SpatialSession();
    } else {
      return null;
    }
  }
  /**
   * Checks if the current page is running in a spatial web environment.
   * This method detects if the application is running in a WebSpatial-compatible browser.
   * @returns True if running in a spatial web environment, false otherwise
   */
  runInSpatialWeb() {
    if (navigator.userAgent.indexOf("WebSpatial/") > 0) {
      return true;
    }
    return false;
  }
  /** @deprecated
   * Checks if WebSpatial is supported in the current environment.
   * Verifies compatibility between native and client versions.
   * @returns True if web spatial is supported by this webpage
   */
  isSupported() {
    return true;
  }
  /** @deprecated
   * Gets the native WebSpatial version from the browser environment.
   * The version format follows semantic versioning (x.x.x).
   * @returns Native version string in format "x.x.x"
   */
  getNativeVersion() {
    if (window.__WebSpatialData && window.__WebSpatialData.getNativeVersion) {
      return window.__WebSpatialData.getNativeVersion();
    }
    return window.WebSpatailNativeVersion === "PACKAGE_VERSION" ? this.getClientVersion() : window.WebSpatailNativeVersion;
  }
  /** @deprecated
   * Gets the client SDK version.
   * The version format follows semantic versioning (x.x.x).
   * @returns Client SDK version string in format "x.x.x"
   */
  getClientVersion() {
    return "1.2.1";
  }
};

// src/spatial-window-polyfill.ts
var spatial = new Spatial();
var session = void 0;
var SpatialGlobalCustomVars = {
  backgroundMaterial: "--xr-background-material"
};
var htmlBackgroundMaterial = "";
function setCurrentWindowStyle(backgroundMaterial) {
  if (backgroundMaterial !== htmlBackgroundMaterial) {
    session?.getSpatialScene()?.updateSpatialProperties({
      material: backgroundMaterial
    });
    htmlBackgroundMaterial = backgroundMaterial;
  }
}
function checkHtmlBackgroundMaterial() {
  const computedStyle = getComputedStyle(document.documentElement);
  const backgroundMaterial = computedStyle.getPropertyValue(
    SpatialGlobalCustomVars.backgroundMaterial
  );
  setCurrentWindowStyle(backgroundMaterial || "none");
}
var htmlCornerRadius = {
  topLeading: 0,
  bottomLeading: 0,
  topTrailing: 0,
  bottomTrailing: 0
};
function checkCornerRadius() {
  const computedStyle = getComputedStyle(document.documentElement);
  const cornerRadius = parseCornerRadius(computedStyle);
  setCornerRadius(cornerRadius);
}
function setCornerRadius(cornerRadius) {
  if (htmlCornerRadius.topLeading !== cornerRadius.topLeading || htmlCornerRadius.bottomLeading !== cornerRadius.bottomLeading || htmlCornerRadius.topTrailing !== cornerRadius.topTrailing || htmlCornerRadius.bottomTrailing !== cornerRadius.bottomTrailing) {
    session?.getSpatialScene()?.updateSpatialProperties({
      cornerRadius
    });
    htmlCornerRadius.topLeading = cornerRadius.topLeading;
    htmlCornerRadius.bottomLeading = cornerRadius.bottomLeading;
    htmlCornerRadius.topTrailing = cornerRadius.topTrailing;
    htmlCornerRadius.bottomTrailing = cornerRadius.bottomTrailing;
  }
}
function setOpacity(opacity) {
  session?.getSpatialScene().updateSpatialProperties({
    opacity
  });
}
function checkOpacity() {
  const computedStyle = getComputedStyle(document.documentElement);
  const opacity = parseFloat(computedStyle.getPropertyValue("opacity"));
  setOpacity(opacity);
}
function hijackDocumentElementStyle() {
  const rawDocumentStyle = document.documentElement.style;
  const styleProxy = new Proxy(rawDocumentStyle, {
    set: function(target, key, value) {
      const ret = Reflect.set(target, key, value);
      if (key === SpatialGlobalCustomVars.backgroundMaterial) {
        setCurrentWindowStyle(value);
      }
      if (key === "border-radius" || key === "borderRadius" || key === "border-top-left-radius" || key === "borderTopLeftRadius" || key === "border-top-right-radius" || key === "borderTopRightRadius" || key === "border-bottom-left-radius" || key === "borderBottomLeftRadius" || key === "border-bottom-right-radius" || key === "borderBottomRightRadius") {
        checkCornerRadius();
      }
      if (key === "opacity") {
        checkOpacity();
      }
      return ret;
    },
    get: function(target, prop) {
      if (typeof target[prop] === "function") {
        return function(...args) {
          if (prop === "setProperty") {
            const [property, value] = args;
            if (property === SpatialGlobalCustomVars.backgroundMaterial) {
              setCurrentWindowStyle(value);
            }
          } else if (prop === "removeProperty") {
            const [property] = args;
            if (property === SpatialGlobalCustomVars.backgroundMaterial) {
              setCurrentWindowStyle("none");
            }
          }
          return target[prop](
            ...args
          );
        };
      }
      return Reflect.get(target, prop);
    }
  });
  Object.defineProperty(document.documentElement, "style", {
    get: function() {
      return styleProxy;
    }
  });
}
function monitorExternalStyleChange() {
  const headObserver = new MutationObserver(checkCSSProperties);
  headObserver.observe(document.head, { childList: true, subtree: true });
}
function checkCSSProperties() {
  checkHtmlBackgroundMaterial();
  checkCornerRadius();
  checkOpacity();
}
function monitorHTMLAttributeChange() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "attributes" && mutation.attributeName) {
        checkCSSProperties();
      }
    });
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["style", "class"]
  });
}
async function spatialWindowPolyfill() {
  if (!spatial.runInSpatialWeb()) {
    return;
  }
  session = await spatial.requestSession();
  if (document.readyState === "complete") {
    checkCSSProperties();
  } else {
    window.addEventListener("load", () => {
      checkCSSProperties();
    });
  }
  hijackDocumentElementStyle();
  monitorExternalStyleChange();
  monitorHTMLAttributeChange();
}

// src/index.ts
if (!isSSREnv() && navigator.userAgent.indexOf("WebSpatial/") > 0) {
  injectSceneHook();
  spatialWindowPolyfill();
}
export {
  Attachment,
  BaseplateVisibilityValues,
  CubeInfo,
  ModelComponent,
  Spatial,
  SpatialBoxGeometry,
  SpatialComponent,
  SpatialConeGeometry,
  SpatialCylinderGeometry,
  SpatialEntity,
  SpatialGeometry,
  SpatialMaterial,
  SpatialModelAsset,
  SpatialModelEntity,
  SpatialObject,
  SpatialPlaneGeometry,
  SpatialScene,
  SpatialSceneState,
  SpatialSceneValues,
  SpatialSession,
  SpatialSphereGeometry,
  SpatialUnlitMaterial,
  Spatialized2DElement,
  SpatializedDynamic3DElement,
  SpatializedElement,
  SpatializedElementType,
  SpatializedStatic3DElement,
  WorldAlignmentValues,
  WorldScalingValues,
  createAttachmentEntity,
  isSSREnv,
  isValidBaseplateVisibilityType,
  isValidSceneUnit,
  isValidSpatialSceneType,
  isValidWorldAlignmentType,
  isValidWorldScalingType
};
//# sourceMappingURL=index.js.map