
      (function(){
        if(typeof window === 'undefined') return;
        if(!window.__webspatialsdk__) window.__webspatialsdk__ = {}
        window.__webspatialsdk__['react-sdk-version'] = "1.2.1"
        window.__webspatialsdk__['XR_ENV'] = "avp"
    })()
      

// src/spatialized-container/hooks/useDomProxy.ts
import { useCallback, useEffect, useRef } from "react";

// src/spatialized-container/types.ts
var SpatialCustomStyleVars = {
  back: "--xr-back",
  depth: "--xr-depth",
  backgroundMaterial: "--xr-background-material",
  xrZIndex: "--xr-z-index"
};

// src/spatialized-container/utils.ts
function getInheritedStyleProps(computedStyle) {
  var propNames = [
    "azimuth",
    "borderCollapse",
    "borderSpacing",
    "captionSide",
    "color",
    "cursor",
    "direction",
    // 'elevation',
    "emptyCells",
    "fontFamily",
    "fontSize",
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "font",
    "letterSpacing",
    "lineHeight",
    "listStyleImage",
    "listStylePosition",
    "listStyleType",
    "listStyle",
    "orphans",
    // 'pitchRange',
    // 'pitch',
    "quotes",
    // 'richness',
    // 'speakHeader',
    // 'speakNumeral',
    // 'speakPunctuation',
    // 'speak',
    // 'speechRate',
    // 'stress',
    "textAlign",
    "textIndent",
    "textTransform",
    "visibility",
    // 'voiceFamily',
    // 'volume',
    "whiteSpace",
    "widows",
    "wordSpacing",
    // background also need to be synced
    "background",
    // position also need to be synced
    "position",
    "width",
    "height",
    "display",
    // content-visibility also need to be synced
    "contentVisibility"
  ];
  var props = {};
  for (var cssName of propNames) {
    if (computedStyle[cssName]) {
      props[cssName] = computedStyle[cssName];
    }
  }
  return props;
}
function parseTransformOrigin(computedStyle) {
  const transformOriginProperty = computedStyle.getPropertyValue("transform-origin");
  const [x, y] = transformOriginProperty.split(" ").map(parseFloat);
  const width = parseFloat(computedStyle.getPropertyValue("width"));
  const height = parseFloat(computedStyle.getPropertyValue("height"));
  return {
    x: width > 0 ? x / width : 0.5,
    y: height > 0 ? y / height : 0.5,
    z: 0.5
  };
}
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
function extractAndRemoveCustomProperties(cssText, properties) {
  if (!cssText) {
    return { extractedValues: {}, filteredCssText: "" };
  }
  const extractedValues = {};
  const rules = cssText.split(";");
  const filteredRules = rules.filter((rule) => {
    const [key, value] = rule.split(":").map((part) => part.trim());
    if (properties.includes(key)) {
      extractedValues[key] = value;
      return false;
    }
    return true;
  });
  const filteredCssText = filteredRules.join(";").trim();
  return { extractedValues, filteredCssText };
}
function joinToCSSText(cssKV) {
  const rules = Object.entries(cssKV).map(([key, value]) => `${key}: ${value}`);
  return rules.join(";");
}

// src/spatialized-container/hooks/useDomProxy.ts
function makeOriginalKey(key) {
  return `__original_${key}`;
}
var SpatialContainerRefProxy = class {
  transformVisibilityTaskContainerDom = null;
  ref;
  domProxy;
  styleProxy;
  // extre ref props, used to add extra props to ref
  extraRefProps;
  constructor(ref, extraRefProps) {
    this.ref = ref;
    this.extraRefProps = extraRefProps;
  }
  updateStandardSpatializedContainerDom(dom) {
    const self = this;
    if (dom) {
      let cacheExtraRefProps;
      const domProxy = new Proxy(
        dom,
        {
          get(target, prop) {
            if (prop === "__raw") {
              return target;
            }
            if (prop === "clientDepth") {
              return target.style.getPropertyValue(SpatialCustomStyleVars.depth);
            }
            if (prop === "offsetBack") {
              return target.style.getPropertyValue(SpatialCustomStyleVars.back);
            }
            if (prop === "getBoundingClientRect") {
              return dom.__getBoundingClientRect;
            }
            if (prop === "getBoundingClientCube") {
              return dom.__getBoundingClientCube;
            }
            if (prop === "style") {
              if (!self.styleProxy) {
                self.styleProxy = new Proxy(target.style, {
                  get(target2, prop2) {
                    if (prop2 === "visibility" || prop2 === "transform") {
                      return self.transformVisibilityTaskContainerDom?.style.getPropertyValue(
                        prop2
                      );
                    }
                    const value2 = Reflect.get(target2, prop2);
                    if (typeof value2 === "function") {
                      if (prop2 === "setProperty" || prop2 === "removeProperty" || prop2 === "getPropertyValue") {
                        return function(...args) {
                          const validProperties = ["visibility", "transform"];
                          const [property] = args;
                          if (validProperties.includes(property)) {
                            if (prop2 === "setProperty") {
                              const [, kValue] = args;
                              self.transformVisibilityTaskContainerDom?.style.setProperty(
                                property,
                                kValue
                              );
                            } else if (prop2 === "removeProperty") {
                              self.transformVisibilityTaskContainerDom?.style.removeProperty(
                                property
                              );
                            } else if (prop2 === "getPropertyValue") {
                              return self.transformVisibilityTaskContainerDom?.style.getPropertyValue(
                                property
                              );
                            }
                          } else {
                            return value2.apply(this, args);
                          }
                        }.bind(target2);
                      } else {
                        return value2.bind(target2);
                      }
                    } else {
                      return value2;
                    }
                  },
                  set(target2, prop2, value2) {
                    if (prop2 === "visibility") {
                      self.transformVisibilityTaskContainerDom?.style.setProperty(
                        "visibility",
                        value2
                      );
                      return true;
                    }
                    if (prop2 === "transform") {
                      self.transformVisibilityTaskContainerDom?.style.setProperty(
                        "transform",
                        value2
                      );
                      return true;
                    }
                    if (prop2 === SpatialCustomStyleVars.backgroundMaterial) {
                      target2.setProperty(
                        SpatialCustomStyleVars.backgroundMaterial,
                        value2
                      );
                    } else if (prop2 === SpatialCustomStyleVars.back) {
                      target2.setProperty(
                        SpatialCustomStyleVars.back,
                        value2
                      );
                    } else if (prop2 === SpatialCustomStyleVars.xrZIndex) {
                      target2.setProperty(
                        SpatialCustomStyleVars.xrZIndex,
                        value2
                      );
                    } else if (prop2 === SpatialCustomStyleVars.depth) {
                      target2.setProperty(
                        SpatialCustomStyleVars.depth,
                        value2
                      );
                    } else if (prop2 === "cssText") {
                      const toFilteredCSSProperties = [
                        "transform",
                        "visibility"
                      ];
                      const { extractedValues, filteredCssText } = extractAndRemoveCustomProperties(
                        value2,
                        toFilteredCSSProperties
                      );
                      toFilteredCSSProperties.forEach((key) => {
                        if (extractedValues[key]) {
                          self.transformVisibilityTaskContainerDom?.style.setProperty(
                            key,
                            extractedValues[key]
                          );
                        } else {
                          target2.removeProperty(key);
                        }
                      });
                      const appendedCSSText = joinToCSSText({
                        transform: "none",
                        visibility: "hidden"
                      });
                      return Reflect.set(
                        target2,
                        prop2,
                        [appendedCSSText, filteredCssText].join(";")
                      );
                    }
                    return Reflect.set(target2, prop2, value2);
                  }
                });
              }
              return self.styleProxy;
            }
            if (typeof prop === "string" && self.extraRefProps) {
              if (!cacheExtraRefProps) {
                cacheExtraRefProps = self.extraRefProps(domProxy);
              }
              const extraProps = cacheExtraRefProps;
              if (extraProps.hasOwnProperty(prop)) {
                return extraProps[prop];
              }
            }
            const value = Reflect.get(target, prop);
            if (typeof value === "function") {
              if ("removeAttribute" === prop) {
                return function(...args) {
                  const [property] = args;
                  if (property === "style") {
                    dom.style.cssText = "visibility: hidden; transition: none; transform: none;";
                    if (self.transformVisibilityTaskContainerDom) {
                      self.transformVisibilityTaskContainerDom.style.visibility = "";
                      self.transformVisibilityTaskContainerDom.style.transform = "";
                    }
                    return true;
                  }
                  if (property === "class") {
                    domProxy.className = "xr-spatial-default";
                    return true;
                  }
                };
              }
              return value.bind(target);
            }
            return value;
          },
          set(target, prop, value) {
            if (prop === "className") {
              if (value && value.indexOf("xr-spatial-default") === -1) {
                value = value + " xr-spatial-default";
              }
              if (self.transformVisibilityTaskContainerDom) {
                self.transformVisibilityTaskContainerDom.className = value;
              }
            }
            if (typeof prop === "string" && self.extraRefProps) {
              if (!cacheExtraRefProps) {
                cacheExtraRefProps = self.extraRefProps(domProxy);
              }
              cacheExtraRefProps[prop] = value;
            }
            return Reflect.set(target, prop, value);
          }
        }
      );
      this.domProxy = domProxy;
      const domClassList = dom.classList;
      const domClassMethodKeys = ["add", "remove", "toggle", "replace"];
      domClassMethodKeys.forEach((key) => {
        const hiddenKey = makeOriginalKey(key);
        const hiddenKeyExist = domClassList[hiddenKey] !== void 0;
        const originalMethod = hiddenKeyExist ? domClassList[hiddenKey] : domClassList[key].bind(domClassList);
        domClassList[hiddenKey] = originalMethod;
        domClassList[key] = function(...args) {
          const result = originalMethod(...args);
          if (self.transformVisibilityTaskContainerDom) {
            self.transformVisibilityTaskContainerDom.className = dom.className;
          }
          return result;
        };
      });
      this.styleProxy = void 0;
      this.updateDomProxyToRef();
      Object.assign(dom, {
        __targetProxy: domProxy
      });
    }
  }
  updateTransformVisibilityTaskContainerDom(dom) {
    this.transformVisibilityTaskContainerDom = dom;
    this.updateDomProxyToRef();
  }
  updateDomProxyToRef() {
    const ref = this.ref;
    if (!ref) {
      return;
    }
    if (this.domProxy && this.transformVisibilityTaskContainerDom) {
      if (typeof ref === "function") {
        ref(this.domProxy);
      } else {
        ref.current = this.domProxy;
      }
    } else {
      if (typeof ref === "function") {
        ref(null);
      } else {
        ref.current = null;
      }
    }
  }
  updateRef(ref) {
    this.ref = ref;
  }
};
function hijackGetComputedStyle() {
  const rawFn = window.getComputedStyle.bind(window);
  window.getComputedStyle = (element, pseudoElt) => {
    const dom = element.__raw;
    if (dom) {
      return rawFn(dom, pseudoElt);
    }
    return rawFn(element, pseudoElt);
  };
}
function useDomProxy(ref, extraRefProps) {
  const spatialContainerRefProxy = useRef(
    new SpatialContainerRefProxy(ref, extraRefProps)
  );
  useEffect(() => {
    spatialContainerRefProxy.current.updateRef(ref);
  }, [ref]);
  const transformVisibilityTaskContainerCallback = useCallback(
    (el) => {
      spatialContainerRefProxy.current.updateTransformVisibilityTaskContainerDom(
        el
      );
    },
    []
  );
  const standardSpatializedContainerCallback = useCallback(
    (el) => {
      spatialContainerRefProxy.current.updateStandardSpatializedContainerDom(el);
    },
    []
  );
  return {
    transformVisibilityTaskContainerCallback,
    standardSpatializedContainerCallback,
    spatialContainerRefProxy
  };
}

// src/spatialized-container/hooks/use2DFrameDetector.ts
import {
  useContext,
  useLayoutEffect,
  useEffect as useEffect2,
  useCallback as useCallback2
} from "react";

// src/spatialized-container/context/SpatializedContainerContext.ts
import { createContext } from "react";

// src/spatialized-container/SpatialID.ts
var SpatialID = "data-spatial-id";

// src/spatialized-container/context/SpatializedContainerContext.ts
var SpatializedContainerObject = class {
  dom = null;
  domSpatialId = null;
  fns = {};
  // cache dom for each spatialId
  spatialId2dom = {};
  spatialId2parentSpatialDom = {};
  // layer : [standardInstance sequence, portalInstance sequence]
  layerSequences = {};
  notify2DFramePlaceHolderChange(dom) {
    this.dom = dom;
    this.domSpatialId = dom.getAttribute(SpatialID);
    Object.values(this.fns).forEach((fn) => fn());
  }
  spatialId2transformVisibility = {};
  updateSpatialTransformVisibility(spatialId, spatialTransformVisibility) {
    this.spatialId2transformVisibility[spatialId] = spatialTransformVisibility;
    this.fnsForSpatialTransformVisibility[spatialId]?.forEach(
      (fn) => fn(spatialTransformVisibility)
    );
  }
  // this is used by onSpatialEvent.currentTarget property
  spatialId2ContainerRefProxy = {};
  // this is called in sub standardInstance env
  updateSpatialContainerRefProxyInfo(spatialId, spatialContainerRefProxy) {
    this.spatialId2ContainerRefProxy[spatialId] = spatialContainerRefProxy;
  }
  getSpatialContainerRefProxyBySpatialId(spatialId) {
    return this.spatialId2ContainerRefProxy[spatialId];
  }
  // notify when TransformVisibilityTaskContainer data change
  fnsForSpatialTransformVisibility = {};
  // used by StandardSpatializedContainer and PortalSpatializedContainer
  onSpatialTransformVisibilityChange(spatialId, fn) {
    if (!this.fnsForSpatialTransformVisibility[spatialId]) {
      this.fnsForSpatialTransformVisibility[spatialId] = [];
    }
    this.fnsForSpatialTransformVisibility[spatialId].push(fn);
    if (this.spatialId2transformVisibility[spatialId]) {
      fn(this.spatialId2transformVisibility[spatialId]);
    }
  }
  offSpatialTransformVisibilityChange(spatialId, fn) {
    const fns = this.fnsForSpatialTransformVisibility[spatialId];
    if (fns) {
      this.fnsForSpatialTransformVisibility[spatialId] = fns.filter(
        (f) => f !== fn
      );
    }
  }
  on2DFrameChange(spatialId, fn) {
    this.fns[spatialId] = fn;
    if (this.dom) {
      fn();
    }
  }
  off2DFrameChange(spatialId) {
    delete this.fns[spatialId];
    delete this.spatialId2dom[spatialId];
    delete this.spatialId2parentSpatialDom[spatialId];
  }
  querySpatialDomBySpatialId(spatialId) {
    if (this.domSpatialId === spatialId) {
      return this.dom;
    }
    if (!this.dom) {
      return null;
    }
    if (!this.spatialId2dom[spatialId]) {
      const spatialDom = this.dom.querySelector(`[${SpatialID}="${spatialId}"]`);
      if (spatialDom) {
        this.spatialId2dom[spatialId] = spatialDom;
      }
    }
    return this.spatialId2dom[spatialId];
  }
  queryParentSpatialDomBySpatialId(spatialId) {
    if (this.domSpatialId === spatialId) {
      return null;
    }
    if (this.spatialId2parentSpatialDom[spatialId]) {
      return this.spatialId2parentSpatialDom[spatialId];
    }
    let spatialDom = this.querySpatialDomBySpatialId(spatialId);
    if (spatialDom) {
      if (spatialDom === this.dom) return null;
      let parentSpatialDom = spatialDom.parentElement;
      while (parentSpatialDom && spatialDom !== this.dom) {
        if (parentSpatialDom.hasAttribute(SpatialID)) {
          break;
        } else {
          parentSpatialDom = parentSpatialDom.parentElement;
        }
      }
      this.spatialId2parentSpatialDom[spatialId] = parentSpatialDom;
      return parentSpatialDom;
    }
    return null;
  }
  getSpatialId(layer, isInStandardInstance, name = "") {
    if (this.layerSequences[layer] === void 0) {
      this.layerSequences[layer] = [0, 0];
    }
    const idx = isInStandardInstance ? 0 : 1;
    const sequenceId = this.layerSequences[layer][idx];
    this.layerSequences[layer][idx] = sequenceId + 1;
    const spatialId = `${name}_${layer}_${sequenceId}`;
    return spatialId;
  }
};
var SpatializedContainerContext = createContext(null);

// src/spatialized-container/hooks/use2DFrameDetector.ts
function use2DFrameDetector(ref) {
  const spatializedContainerObject = useContext(
    SpatializedContainerContext
  );
  const notify2DFrameChange = useCallback2(() => {
    ref.current && spatializedContainerObject.notify2DFramePlaceHolderChange(ref.current);
  }, [ref.current, spatializedContainerObject]);
  useLayoutEffect(notify2DFrameChange, [notify2DFrameChange]);
  useEffect2(() => {
    if (!ref.current || !spatializedContainerObject) {
      console.warn(
        "Ref is not attached to the DOM or spatializedContainerObject is not available"
      );
      return;
    }
    window.addEventListener("resize", notify2DFrameChange);
    return () => {
      window.removeEventListener("resize", notify2DFrameChange);
    };
  }, []);
  useEffect2(() => {
    if (!ref.current) {
      console.warn("Ref is not attached to the DOM");
      return;
    }
    const ro = new ResizeObserver(notify2DFrameChange);
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
    };
  }, []);
  useEffect2(() => {
    if (!ref.current) {
      console.warn("Ref is not attached to the DOM");
      return;
    }
    const ro = new MutationObserver(notify2DFrameChange);
    ro.observe(ref.current, {
      attributeFilter: ["class", "style"],
      subtree: true
    });
    return () => {
      ro.disconnect();
    };
  }, []);
}

// src/spatialized-container/StandardSpatializedContainer.tsx
import {
  forwardRef,
  useCallback as useCallback3,
  useContext as useContext2,
  useEffect as useEffect3,
  useRef as useRef2,
  useState
} from "react";
import { jsx } from "react/jsx-runtime";
function useSpatialTransformVisibilityWatcher(spatialId) {
  const [transformExist, setTransformExist] = useState(false);
  const spatializedContainerObject = useContext2(SpatializedContainerContext);
  useEffect3(() => {
    const fn = (spatialTransform) => {
      setTransformExist(spatialTransform.transform !== "none");
    };
    spatializedContainerObject.onSpatialTransformVisibilityChange(spatialId, fn);
    return () => {
      spatializedContainerObject.offSpatialTransformVisibilityChange(
        spatialId,
        fn
      );
    };
  }, [spatialId, spatializedContainerObject]);
  return transformExist;
}
function useInternalRef(ref) {
  const refInternal = useRef2(null);
  const refInternalCallback = useCallback3(
    (node) => {
      refInternal.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref]
  );
  return { refInternal, refInternalCallback };
}
function StandardSpatializedContainerBase(props, ref) {
  const {
    component: Component,
    style: inStyle = {},
    className,
    inStandardSpatializedContainer = false,
    ...restProps
  } = props;
  const { refInternal, refInternalCallback } = useInternalRef(ref);
  if (!inStandardSpatializedContainer) {
    use2DFrameDetector(refInternal);
  }
  const transformExist = useSpatialTransformVisibilityWatcher(props[SpatialID]);
  const extraStyle = {
    visibility: "hidden",
    transition: "none",
    transform: transformExist ? "translateZ(0)" : "none"
  };
  const style = { ...inStyle, ...extraStyle };
  const classNames = className ? `${className} xr-spatial-default` : "xr-spatial-default";
  return /* @__PURE__ */ jsx(
    Component,
    {
      ref: refInternalCallback,
      style,
      className: classNames,
      ...restProps
    }
  );
}
var StandardSpatializedContainer = forwardRef(
  StandardSpatializedContainerBase
);
function injectSpatialDefaultStyle() {
  const styleElement = document.createElement("style");
  styleElement.type = "text/css";
  styleElement.innerHTML = " :where(.xr-spatial-default) {  --xr-back: 0; --xr-depth: 0; --xr-z-index: 0; --xr-background-material: none;  } ";
  document.head.appendChild(styleElement);
}

// src/spatialized-container/TransformVisibilityTaskContainer.tsx
import {
  forwardRef as forwardRef2,
  useCallback as useCallback5,
  useRef as useRef3
} from "react";
import { createPortal } from "react-dom";

// src/spatialized-container/hooks/useSpatialTransformVisibility.ts
import { useCallback as useCallback4, useContext as useContext3, useEffect as useEffect4 } from "react";

// src/notifyUpdateStandInstanceLayout.ts
function notifyUpdateStandInstanceLayout() {
  document.dispatchEvent(
    new CustomEvent("standInstanceLayout" /* standInstanceLayout */, {
      detail: {}
    })
  );
}
function notifyDOMUpdate(mutationsList) {
  document.dispatchEvent(
    new CustomEvent("domUpdated" /* domUpdated */, {
      detail: mutationsList
    })
  );
}

// src/spatialized-container/hooks/useSpatialTransformVisibility.ts
function parseTransformAndVisibilityProperties(node) {
  const computedStyle = getComputedStyle(node);
  const transform = computedStyle.getPropertyValue("transform");
  const visibility = computedStyle.getPropertyValue("visibility");
  return {
    visibility,
    transform
  };
}
function useSpatialTransformVisibility(spatialId, ref) {
  const spatializedContainerObject = useContext3(SpatializedContainerContext);
  const checkSpatialStyleUpdate = useCallback4(() => {
    if (!ref.current) {
      return;
    }
    const spatialTransformVisibility = parseTransformAndVisibilityProperties(
      ref.current
    );
    spatializedContainerObject.updateSpatialTransformVisibility(
      spatialId,
      spatialTransformVisibility
    );
  }, []);
  useEffect4(() => {
    checkSpatialStyleUpdate();
  }, [checkSpatialStyleUpdate]);
  useEffect4(() => {
    const observer = new MutationObserver((mutationsList) => {
      checkSpatialStyleUpdate();
    });
    const config = {
      childList: false,
      subtree: false,
      attributes: true,
      // attributeOldValue: true,
      attributeFilter: ["style", "class"]
    };
    observer.observe(ref.current, config);
    return () => {
      observer.disconnect();
    };
  }, []);
  useEffect4(() => {
    const headObserver = new MutationObserver((mutations) => {
      checkSpatialStyleUpdate();
    });
    headObserver.observe(document.head, { childList: true, subtree: true });
    return () => {
      headObserver.disconnect();
    };
  }, []);
  useEffect4(() => {
    const onDomUpdated = (event) => {
      checkSpatialStyleUpdate();
    };
    document.addEventListener(
      "domUpdated" /* domUpdated */,
      onDomUpdated
    );
    return () => {
      document.removeEventListener(
        "domUpdated" /* domUpdated */,
        onDomUpdated
      );
    };
  }, []);
}

// src/spatialized-container/TransformVisibilityTaskContainer.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
var cssParserDivContainer = null;
function initCSSParserDivContainer() {
  cssParserDivContainer = document?.createElement("div");
  if (cssParserDivContainer) {
    cssParserDivContainer.style.position = "absolute";
    cssParserDivContainer.setAttribute("data-id", "css-parser-div-container");
  }
}
function createOrGetCSSParserDivContainer() {
  if (cssParserDivContainer && !cssParserDivContainer.parentElement) {
    document?.body.appendChild(cssParserDivContainer);
  }
  return cssParserDivContainer;
}
function useInternalRef2(ref) {
  const refInternal = useRef3(null);
  const refInternalCallback = useCallback5(
    (node) => {
      refInternal.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref]
  );
  return { refInternal, refInternalCallback };
}
function TransformVisibilityTaskContainerBase(props, ref) {
  const { style: inStyle, ...restProps } = props;
  const extraStyle = {
    // when width/height equal to zero, transform: translateX(-50%) won't work
    // to make sure the element is not visible, we set left/top to a very large negative value
    left: -1e4,
    top: -1e4,
    pointerEvents: "none",
    opacity: 0,
    // width: 0,
    // height: 0,
    padding: 0,
    transition: "none",
    position: "absolute"
  };
  const { refInternal, refInternalCallback } = useInternalRef2(ref);
  const style = { ...inStyle, ...extraStyle };
  useSpatialTransformVisibility(props[SpatialID], refInternal);
  const cssParserDivContainer2 = createOrGetCSSParserDivContainer();
  if (!cssParserDivContainer2) {
    return null;
  }
  return createPortal(
    /* @__PURE__ */ jsx2("div", { ref: refInternalCallback, style, ...restProps }),
    cssParserDivContainer2
  );
}
var TransformVisibilityTaskContainer = forwardRef2(
  TransformVisibilityTaskContainerBase
);

// src/spatialized-container/SpatializedContainer.tsx
import { forwardRef as forwardRef4, useContext as useContext7, useEffect as useEffect10, useMemo as useMemo2 } from "react";

// src/utils/getSession.ts
import { isSSREnv, Spatial } from "@webspatial/core-sdk";
var spatial = null;
var _currentSession = null;
function getSession() {
  if (isSSREnv()) return null;
  if (!spatial) {
    spatial = new Spatial();
  }
  if (!spatial.isSupported()) {
    return null;
  }
  if (_currentSession) {
    return _currentSession;
  }
  _currentSession = spatial.requestSession();
  return _currentSession;
}

// src/spatialized-container/context/SpatialLayerContext.ts
import { createContext as createContext2 } from "react";
var SpatialLayerContext = createContext2(0);

// src/spatialized-container/PortalSpatializedContainer.tsx
import { useMemo, useContext as useContext4, useEffect as useEffect7 } from "react";

// src/spatialized-container/context/PortalInstanceContext.ts
import { createContext as createContext3 } from "react";

// src/utils/debugTool.ts
import { isSSREnv as isSSREnv2 } from "@webspatial/core-sdk";
async function inspectCurrentSpatialScene() {
  const spatialScene = getSession().getSpatialScene();
  return spatialScene.inspect();
}
function getSpatialized2DElement(spatialized2DElement) {
  return spatialized2DElement.__innerSpatializedElement?.();
}
function enableDebugTool() {
  if (isSSREnv2()) return;
  Object.assign(window, {
    inspectCurrentSpatialScene,
    getSpatialized2DElement
  });
}

// src/utils/androidBitmapCapture.ts
var snapdomModule = null;
var snapdomChecked = false;
var snapdomAvailable = false;
var html2canvasModule = null;
var html2canvasChecked = false;
var html2canvasAvailable = false;
async function loadSnapdom() {
  if (snapdomModule) return snapdomModule;
  if (snapdomChecked && !snapdomAvailable) return null;
  console.log("[WebSpatial] Checking for snapdom...", {
    windowExists: typeof window !== "undefined",
    snapdomOnWindow: typeof window?.snapdom,
    html2canvasOnWindow: typeof window?.html2canvas
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    if (typeof window !== "undefined" && window.snapdom) {
      snapdomModule = window.snapdom;
      snapdomChecked = true;
      snapdomAvailable = true;
      console.log("[WebSpatial] Using globally provided snapdom (fast mode)");
      return snapdomModule;
    }
    if (attempt < 2) {
      console.log(`[WebSpatial] snapdom not on window, retry ${attempt + 1}/3...`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  try {
    console.log("[WebSpatial] Trying dynamic import of @zumer/snapdom...");
    const moduleName = "@zumer/snapdom";
    const dynamicImport = new Function("moduleName", "return import(moduleName)");
    const module = await dynamicImport(moduleName);
    snapdomModule = module.snapdom || module.default || module;
    snapdomChecked = true;
    snapdomAvailable = true;
    console.log("[WebSpatial] Loaded snapdom via dynamic import (fast mode)");
    return snapdomModule;
  } catch (error) {
    snapdomChecked = true;
    snapdomAvailable = false;
    console.log("[WebSpatial] snapdom not available:", error.message);
    console.log("[WebSpatial] Falling back to html2canvas");
    return null;
  }
}
async function loadHtml2Canvas() {
  if (html2canvasModule) return html2canvasModule;
  if (html2canvasChecked && !html2canvasAvailable) return null;
  if (typeof window !== "undefined" && window.html2canvas) {
    html2canvasModule = window.html2canvas;
    html2canvasChecked = true;
    html2canvasAvailable = true;
    console.log("[WebSpatial] Using globally provided html2canvas (fallback mode)");
    return html2canvasModule;
  }
  try {
    const moduleName = "html2canvas";
    const dynamicImport = new Function("moduleName", "return import(moduleName)");
    const module = await dynamicImport(moduleName);
    html2canvasModule = module.default || module;
    html2canvasChecked = true;
    html2canvasAvailable = true;
    console.log("[WebSpatial] Loaded html2canvas via dynamic import (fallback mode)");
    return html2canvasModule;
  } catch (error) {
    html2canvasChecked = true;
    html2canvasAvailable = false;
    console.warn(
      "[WebSpatial] Neither snapdom nor html2canvas available. Bitmap capture for Android XR is disabled. Install @zumer/snapdom (recommended) or html2canvas."
    );
    return null;
  }
}
function isAndroidPlatform() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const hasWebSpatialBridge = typeof window.webspatialBridge !== "undefined";
  return hasWebSpatialBridge && (ua.includes("Android") || ua.includes("Linux"));
}
function getAndroidRenderMode() {
  if (typeof window === "undefined") {
    return null;
  }
  const bridgeMode = window.webspatialBridge?.getRenderMode?.();
  if (bridgeMode === "live-window" || bridgeMode === "bitmap-capture") {
    return bridgeMode;
  }
  const configuredMode = window.__WebSpatialAndroidConfig?.renderMode;
  if (configuredMode === "live-window" || configuredMode === "bitmap-capture") {
    return configuredMode;
  }
  if (!isAndroidPlatform()) {
    return null;
  }
  return "bitmap-capture";
}
function supportsAndroidLiveWindowProxy() {
  return getAndroidRenderMode() === "live-window";
}
function usesAndroidBitmapCapture() {
  return isAndroidPlatform() && !supportsAndroidLiveWindowProxy();
}
var DEFAULT_CAPTURE_BACKGROUND = "#1a1a2e";
function hasTransparentBackground(element) {
  const style = window.getComputedStyle(element);
  const bg = style.backgroundColor;
  const bgImage = style.backgroundImage;
  if (bg === "transparent" || bg === "rgba(0, 0, 0, 0)" || bg === "" || bg === "initial") {
    if (bgImage === "none" || bgImage === "" || bgImage === "initial") {
      return true;
    }
  }
  return false;
}
function injectCaptureBackground(element, backgroundColor = DEFAULT_CAPTURE_BACKGROUND) {
  const restoreFunctions = [];
  const wasTransparent = hasTransparentBackground(element);
  if (wasTransparent) {
    const originalBg = element.style.backgroundColor;
    element.style.backgroundColor = backgroundColor;
    restoreFunctions.push(() => {
      element.style.backgroundColor = originalBg;
    });
  }
  const shouldInjectDescendantBackground = (candidate) => {
    if (!hasTransparentBackground(candidate)) {
      return false;
    }
    const style = window.getComputedStyle(candidate);
    if (style.display === "inline" || style.display === "contents") {
      return false;
    }
    const rect = candidate.getBoundingClientRect();
    const hasMeaningfulBox = rect.width >= 32 && rect.height >= 32;
    if (!hasMeaningfulBox) {
      return false;
    }
    const hasNestedLayout = candidate.children.length > 0;
    const hasVisualContainerTraits = style.borderRadius !== "0px" || style.boxShadow !== "none" || style.backdropFilter !== "none" || style.overflow !== "visible" || style.borderStyle !== "none";
    return hasNestedLayout || hasVisualContainerTraits;
  };
  const allDescendants = element.querySelectorAll("*");
  let injectedCount = 0;
  allDescendants.forEach((el) => {
    const htmlEl = el;
    if (shouldInjectDescendantBackground(htmlEl)) {
      const childOriginalBg = htmlEl.style.backgroundColor;
      htmlEl.style.backgroundColor = backgroundColor;
      injectedCount++;
      restoreFunctions.push(() => {
        htmlEl.style.backgroundColor = childOriginalBg;
      });
    }
  });
  console.log(
    `[WebSpatial] Injected background ${backgroundColor} for capture (parent transparent: ${wasTransparent}, ${injectedCount} children)`
  );
  return () => {
    restoreFunctions.forEach((restore) => restore());
  };
}
var initialRenderDelayApplied = false;
async function waitForContent(element, imageTimeoutMs = 2e3) {
  if (!initialRenderDelayApplied) {
    initialRenderDelayApplied = true;
    console.log("[WebSpatial] Applying initial render delay (1500ms) for first capture");
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  try {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 500))
    ]);
  } catch {
  }
  const images = element.querySelectorAll("img");
  console.log(`[WebSpatial] Found ${images.length} images in element`);
  if (images.length > 0) {
    Array.from(images).forEach((img, i) => {
      const src = img.src?.substring(0, 80) || "no-src";
      console.log(
        `[WebSpatial] Image ${i}: complete=${img.complete}, naturalWidth=${img.naturalWidth}, src=${src}...`
      );
    });
    const incompleteImages = Array.from(images).filter((img) => !img.complete);
    if (incompleteImages.length > 0) {
      console.log(`[WebSpatial] Waiting for ${incompleteImages.length} images to load (timeout: ${imageTimeoutMs}ms)`);
      const imagePromises = incompleteImages.map((img) => {
        return new Promise((resolve) => {
          const handler = () => resolve();
          img.addEventListener("load", handler, { once: true });
          img.addEventListener("error", handler, { once: true });
        });
      });
      await Promise.race([
        Promise.all(imagePromises),
        new Promise((resolve) => setTimeout(resolve, imageTimeoutMs))
      ]);
      const stillIncomplete = incompleteImages.filter((img) => !img.complete).length;
      console.log(`[WebSpatial] Image wait complete. ${stillIncomplete} images still loading.`);
    } else {
      console.log(`[WebSpatial] All ${images.length} images already complete`);
    }
  }
  const textContent = element.innerText?.trim() || "";
  if (textContent.length < 100) {
    console.log(`[WebSpatial] Element has minimal content (${textContent.length} chars), waiting 500ms more`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
var MAX_BITMAP_DIMENSION = 2048;
function resizeCanvasIfNeeded(canvas) {
  const { width, height } = canvas;
  if (width <= MAX_BITMAP_DIMENSION && height <= MAX_BITMAP_DIMENSION) {
    return canvas;
  }
  const scaleFactor = Math.min(
    MAX_BITMAP_DIMENSION / width,
    MAX_BITMAP_DIMENSION / height
  );
  const newWidth = Math.round(width * scaleFactor);
  const newHeight = Math.round(height * scaleFactor);
  console.log(
    `[WebSpatial] Resizing bitmap from ${width}x${height} to ${newWidth}x${newHeight}`
  );
  const resizedCanvas = document.createElement("canvas");
  resizedCanvas.width = newWidth;
  resizedCanvas.height = newHeight;
  const ctx = resizedCanvas.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, 0, 0, newWidth, newHeight);
  }
  return resizedCanvas;
}
async function captureWithSnapdom(snapdom, element, scale) {
  try {
    const cappedScale = Math.min(scale, 1.5);
    const rect = element.getBoundingClientRect();
    console.log(`[WebSpatial] snapdom capturing: rect=(${rect.x.toFixed(0)},${rect.y.toFixed(0)},${rect.width.toFixed(0)},${rect.height.toFixed(0)}), scale=${cappedScale}`);
    const result = await snapdom(element, {
      scale: cappedScale,
      embedFonts: false
    });
    let canvas = await result.toCanvas();
    canvas = resizeCanvasIfNeeded(canvas);
    const dataUrl = canvas.toDataURL("image/webp", 0.85);
    return dataUrl;
  } catch (error) {
    console.error("[WebSpatial] snapdom capture failed:", error);
    return null;
  }
}
function createVisibleCaptureClone(element) {
  const rect = element.getBoundingClientRect();
  const sandbox = document.createElement("div");
  sandbox.setAttribute("aria-hidden", "true");
  sandbox.style.position = "fixed";
  sandbox.style.left = "-10000px";
  sandbox.style.top = "0px";
  sandbox.style.pointerEvents = "none";
  sandbox.style.zIndex = "-1";
  sandbox.style.contain = "layout style paint";
  sandbox.style.opacity = "1";
  const clone = element.cloneNode(true);
  const makeCloneVisible = (node) => {
    node.style.visibility = "visible";
    node.style.opacity = "1";
    node.style.transition = "none";
    node.style.animation = "none";
    node.style.transform = "none";
    node.style.top = "0px";
    node.style.left = "0px";
    Array.from(node.children).forEach((child) => {
      if (child instanceof HTMLElement) {
        makeCloneVisible(child);
      }
    });
  };
  makeCloneVisible(clone);
  clone.style.position = "relative";
  clone.style.margin = "0px";
  clone.style.width = `${Math.ceil(rect.width)}px`;
  clone.style.minHeight = `${Math.ceil(rect.height)}px`;
  sandbox.appendChild(clone);
  document.body.appendChild(sandbox);
  return {
    clone,
    cleanup: () => sandbox.remove()
  };
}
async function captureWithHtml2Canvas(html2canvas, element, scale, backgroundColor) {
  try {
    const rect = element.getBoundingClientRect();
    console.log(
      `[WebSpatial] html2canvas capturing via visible clone: rect=(${rect.x.toFixed(0)},${rect.y.toFixed(0)},${rect.width.toFixed(0)},${rect.height.toFixed(0)})`
    );
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const viewportTop = scrollY;
    const viewportBottom = scrollY + window.innerHeight;
    const elementTop = rect.y + scrollY;
    const elementBottom = elementTop + rect.height;
    console.log(
      `[WebSpatial] Capture context: viewport=(${viewportTop}-${viewportBottom}), element=(${elementTop}-${elementBottom}), innerHeight=${window.innerHeight}`
    );
    let canvas;
    const captureClone = createVisibleCaptureClone(element);
    const restoreBackground = injectCaptureBackground(
      captureClone.clone,
      backgroundColor || DEFAULT_CAPTURE_BACKGROUND
    );
    try {
      await new Promise(
        (resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))
      );
      const cloneRect = captureClone.clone.getBoundingClientRect();
      console.log(
        `[WebSpatial] Visible clone ready: rect=(${cloneRect.x.toFixed(0)},${cloneRect.y.toFixed(0)},${cloneRect.width.toFixed(0)},${cloneRect.height.toFixed(0)})`
      );
      canvas = await html2canvas(captureClone.clone, {
        backgroundColor,
        logging: true,
        // Enable logging to debug
        scale: Math.min(scale, 1.5),
        useCORS: true,
        allowTaint: true,
        imageTimeout: 5e3,
        removeContainer: true,
        foreignObjectRendering: false
      });
    } finally {
      restoreBackground();
      captureClone.cleanup();
    }
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const xPositions = [50, Math.floor(canvas.width / 4), Math.floor(canvas.width / 2), Math.floor(canvas.width * 3 / 4)];
      const yPositions = [50, 100, 200, 400, 600, 800, 1e3, 1200, 1400];
      const samples = [];
      yPositions.forEach((y) => {
        if (y < canvas.height) {
          xPositions.forEach((x) => {
            if (x < canvas.width) {
              samples.push({ name: `(${x},${y})`, x, y });
            }
          });
        }
      });
      console.log(`[WebSpatial] Canvas size: ${canvas.width}x${canvas.height}, scale=${scale}`);
      let bgCount = 0;
      let contentCount = 0;
      let contentPixels = [];
      samples.forEach((s) => {
        const pixel = ctx.getImageData(s.x, s.y, 1, 1).data;
        const isBackground = pixel[0] === 26 && pixel[1] === 26 && pixel[2] === 46;
        if (isBackground) {
          bgCount++;
        } else {
          contentCount++;
          contentPixels.push(`${s.name}=rgba(${pixel[0]},${pixel[1]},${pixel[2]})`);
        }
      });
      console.log(`[WebSpatial] Grid sample: ${bgCount} BG, ${contentCount} CONTENT`);
      if (contentPixels.length > 0) {
        console.log(`[WebSpatial] Content pixels: ${contentPixels.slice(0, 10).join(", ")}`);
      }
      if (contentCount === 0) {
        console.log(`[WebSpatial] No content in grid sample - scanning center column...`);
        for (let y = 0; y < canvas.height; y += 30) {
          const pixel = ctx.getImageData(Math.floor(canvas.width / 2), y, 1, 1).data;
          const isBackground = pixel[0] === 26 && pixel[1] === 26 && pixel[2] === 46;
          if (!isBackground) {
            console.log(`[WebSpatial] First content at Y=${y}: rgba(${pixel[0]},${pixel[1]},${pixel[2]})`);
            break;
          }
        }
      }
    }
    canvas = resizeCanvasIfNeeded(canvas);
    const dataUrl = canvas.toDataURL("image/webp", 0.85);
    return dataUrl;
  } catch (error) {
    console.error("[WebSpatial] html2canvas capture failed:", error);
    return null;
  }
}
async function captureElementBitmap(element, options) {
  if (!usesAndroidBitmapCapture()) {
    return null;
  }
  const scale = options?.scale ?? (window.devicePixelRatio || 1);
  const startTime = performance.now();
  if (options?.waitForImages !== false) {
    await waitForContent(element, 500);
  }
  let result = null;
  const html2canvas = await loadHtml2Canvas();
  if (html2canvas) {
    console.log("[WebSpatial] Using html2canvas (primary)");
    result = await captureWithHtml2Canvas(
      html2canvas,
      element,
      scale,
      options?.backgroundColor ?? DEFAULT_CAPTURE_BACKGROUND
    );
    if (result) {
      const elapsed = Math.round(performance.now() - startTime);
      console.log(`[WebSpatial] Capture complete (html2canvas, ${elapsed}ms)`);
      return result;
    }
  }
  const snapdom = await loadSnapdom();
  if (snapdom) {
    console.log("[WebSpatial] Falling back to snapdom");
    result = await captureWithSnapdom(snapdom, element, scale);
    if (result) {
      const elapsed = Math.round(performance.now() - startTime);
      console.log(`[WebSpatial] Capture complete (snapdom, ${elapsed}ms)`);
      return result;
    }
  }
  console.error("[WebSpatial] No capture library available");
  return null;
}
function observeContentChanges(element, onContentChange) {
  const observer = new MutationObserver((_mutations) => {
    onContentChange();
  });
  observer.observe(element, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "style"]
  });
  let resizeObserver = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver((_entries) => {
      onContentChange();
    });
    resizeObserver.observe(element);
  }
  return () => {
    observer.disconnect();
    resizeObserver?.disconnect();
  };
}

// src/utils/BitmapCaptureCoordinator.ts
var BitmapCaptureCoordinatorClass = class {
  // Track completed captures by element UUID
  capturedElements = /* @__PURE__ */ new Set();
  // Track in-flight capture requests
  pendingCaptures = /* @__PURE__ */ new Map();
  // Minimum time between recaptures of the same element (ms)
  recaptureThrottleMs = 750;
  // Capture queue for serialized processing (prevents thread contention)
  captureQueue = [];
  isProcessingQueue = false;
  /**
   * Request a bitmap capture for an element.
   * Returns null immediately if the element has already been captured.
   * Deduplicates concurrent requests for the same element.
   * Captures are serialized to prevent thread contention.
   *
   * @param elementId Unique element ID (UUID, not spatialId)
   * @param dom The DOM element to capture
   * @returns Promise resolving to bitmap data URL, or null if already captured
   */
  async requestCapture(elementId, dom) {
    if (this.capturedElements.has(elementId)) {
      console.log(`[WebSpatial] Skipping capture for ${elementId} (already captured)`);
      return null;
    }
    const pending = this.pendingCaptures.get(elementId);
    if (pending) {
      console.log(`[WebSpatial] Joining existing capture for ${elementId}`);
      return pending.promise;
    }
    this.capturedElements.add(elementId);
    const promise = new Promise((resolve, reject) => {
      this.captureQueue.push({ elementId, dom, resolve, reject });
      console.log(`[WebSpatial] Queued capture for ${elementId} (queue size: ${this.captureQueue.length})`);
    });
    this.pendingCaptures.set(elementId, {
      promise,
      timestamp: Date.now()
    });
    promise.finally(() => {
      this.pendingCaptures.delete(elementId);
    });
    this.processQueue();
    return promise;
  }
  /**
   * Process the capture queue one at a time.
   * This prevents thread contention and ensures consistent capture performance.
   */
  async processQueue() {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;
    while (this.captureQueue.length > 0) {
      const item = this.captureQueue.shift();
      const { elementId, dom, resolve, reject } = item;
      try {
        console.log(`[WebSpatial] Processing capture for ${elementId} (${this.captureQueue.length} remaining)`);
        const bitmap = await this.doCapture(elementId, dom);
        resolve(bitmap);
      } catch (error) {
        reject(error);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    this.isProcessingQueue = false;
  }
  /**
   * Force a recapture of an element (e.g., after content change).
   * Respects throttling to prevent excessive recaptures.
   */
  async requestRecapture(elementId, dom) {
    const pending = this.pendingCaptures.get(elementId);
    if (pending && Date.now() - pending.timestamp < this.recaptureThrottleMs) {
      console.log(`[WebSpatial] Throttling recapture for ${elementId}`);
      return pending.promise;
    }
    this.capturedElements.delete(elementId);
    return this.requestCapture(elementId, dom);
  }
  /**
   * Perform the actual capture.
   */
  async doCapture(elementId, dom) {
    console.log(`[WebSpatial] Starting capture for ${elementId}`);
    this.logElementDiagnostics(elementId, dom);
    try {
      const bitmap = await captureElementBitmap(dom);
      if (bitmap) {
        const sizeKB = Math.round(bitmap.length / 1024);
        console.log(`[WebSpatial] Capture complete for ${elementId} (${sizeKB}KB)`);
      } else {
        console.log(`[WebSpatial] Capture returned null for ${elementId}`);
      }
      return bitmap;
    } catch (error) {
      console.error(`[WebSpatial] Capture failed for ${elementId}:`, error);
      this.capturedElements.delete(elementId);
      return null;
    }
  }
  /**
   * Clear the capture state for an element (e.g., when destroyed).
   */
  clearElement(elementId) {
    this.capturedElements.delete(elementId);
    this.pendingCaptures.delete(elementId);
  }
  /**
   * Clear all capture state (e.g., on page navigation).
   */
  clearAll() {
    this.capturedElements.clear();
    this.pendingCaptures.clear();
  }
  /**
   * Check if an element has been captured.
   */
  hasCaptured(elementId) {
    return this.capturedElements.has(elementId);
  }
  /**
   * Log detailed diagnostics about an element before capture.
   * This helps debug issues like content being shifted or hidden.
   */
  logElementDiagnostics(elementId, dom) {
    const rect = dom.getBoundingClientRect();
    const style = window.getComputedStyle(dom);
    console.log(`[WebSpatial] === CAPTURE DIAGNOSTICS: ${elementId} ===`);
    console.log(`[WebSpatial] Element: ${dom.tagName}.${dom.className}`);
    console.log(`[WebSpatial] BoundingRect: (${rect.x.toFixed(0)}, ${rect.y.toFixed(0)}, ${rect.width.toFixed(0)}, ${rect.height.toFixed(0)})`);
    console.log(`[WebSpatial] Position: ${style.position}, Top: ${style.top}, Left: ${style.left}`);
    console.log(`[WebSpatial] Padding: ${style.paddingTop} / ${style.paddingRight} / ${style.paddingBottom} / ${style.paddingLeft}`);
    console.log(`[WebSpatial] Margin: ${style.marginTop} / ${style.marginRight} / ${style.marginBottom} / ${style.marginLeft}`);
    console.log(`[WebSpatial] Visibility: ${style.visibility}, Display: ${style.display}`);
    console.log(`[WebSpatial] Overflow: ${style.overflow}, OverflowY: ${style.overflowY}`);
    const parent = dom.parentElement;
    if (parent) {
      const parentStyle = window.getComputedStyle(parent);
      const parentRect = parent.getBoundingClientRect();
      console.log(`[WebSpatial] Parent: ${parent.tagName}.${parent.className}`);
      console.log(`[WebSpatial] Parent BoundingRect: (${parentRect.x.toFixed(0)}, ${parentRect.y.toFixed(0)}, ${parentRect.width.toFixed(0)}, ${parentRect.height.toFixed(0)})`);
      console.log(`[WebSpatial] Parent Position: ${parentStyle.position}, Top: ${parentStyle.top}`);
    }
    const children = dom.children;
    console.log(`[WebSpatial] Children count: ${children.length}`);
    for (let i = 0; i < Math.min(5, children.length); i++) {
      const child = children[i];
      const childRect = child.getBoundingClientRect();
      const childStyle = window.getComputedStyle(child);
      console.log(`[WebSpatial] Child ${i}: ${child.tagName}.${child.className?.substring(0, 30)}...`);
      console.log(`[WebSpatial]   Rect: (${childRect.x.toFixed(0)}, ${childRect.y.toFixed(0)}, ${childRect.width.toFixed(0)}, ${childRect.height.toFixed(0)})`);
      console.log(`[WebSpatial]   Position: ${childStyle.position}, Visibility: ${childStyle.visibility}`);
    }
    console.log(`[WebSpatial] === END DIAGNOSTICS ===`);
  }
};
var BitmapCaptureCoordinator = new BitmapCaptureCoordinatorClass();

// src/spatialized-container/transform-utils.ts
function toSceneSpatial(point, spatializedElement) {
  return spatializedElement.__toSceneSpace(point);
}
function toLocalSpace(point, spatializedElement) {
  return spatializedElement.__toLocalSpace(point);
}
function convertDOMRectToSceneSpace(originalRect, matrix) {
  const topLeft = new DOMPoint(originalRect.left, originalRect.top);
  const topRight = new DOMPoint(originalRect.right, originalRect.top);
  const bottomRight = new DOMPoint(originalRect.right, originalRect.bottom);
  const bottomLeft = new DOMPoint(originalRect.left, originalRect.bottom);
  const transformedTopLeft = matrix.transformPoint(topLeft);
  const transformedTopRight = matrix.transformPoint(topRight);
  const transformedBottomRight = matrix.transformPoint(bottomRight);
  const transformedBottomLeft = matrix.transformPoint(bottomLeft);
  const allPoints = [
    transformedTopLeft,
    transformedTopRight,
    transformedBottomRight,
    transformedBottomLeft
  ];
  const xCoords = allPoints.map((point) => point.x);
  const yCoords = allPoints.map((point) => point.y);
  const newMinX = Math.min(...xCoords);
  const newMaxX = Math.max(...xCoords);
  const newMinY = Math.min(...yCoords);
  const newMaxY = Math.max(...yCoords);
  return new DOMRect(newMinX, newMinY, newMaxX - newMinX, newMaxY - newMinY);
}

// src/spatialized-container/context/PortalInstanceContext.ts
var PortalInstanceObject = class {
  spatialId;
  spatializedContainerObject;
  parentPortalInstanceObject;
  spatializedElement;
  // cachedDomInfo used for cache dom info
  // when dom is updated, this property should be updated as well
  cachedDomInfo;
  get dom() {
    return this.cachedDomInfo?.dom;
  }
  get computedStyle() {
    return this.cachedDomInfo?.computedStyle;
  }
  get isFixedPosition() {
    return this.cachedDomInfo?.isFixedPosition;
  }
  // cachedDomRect used for cache dom rect
  cachedDomRect;
  get domRect() {
    return this.cachedDomRect;
  }
  // cachedTransformVisibilityInfo used for cache transform visibility info
  cachedTransformVisibilityInfo;
  get transformMatrix() {
    return this.cachedTransformVisibilityInfo?.transformMatrix;
  }
  get visibility() {
    return this.cachedTransformVisibilityInfo?.visibility;
  }
  // spatializedElementPromise used for get spatialized element
  // SpatializedElement is when attachSpatializedElement is called
  spatializedElementPromise;
  spatializedElementResolver;
  // used for get extra spatialized element properties
  getExtraSpatializedElementProperties;
  // Bitmap capture state for Android
  pendingBitmapCapture = null;
  // Initial delay before first capture (0ms = start immediately, content detection handles fonts/images)
  bitmapCaptureInitialDelayMs = 0;
  // Track if capture has been requested via coordinator
  captureRequested = false;
  observedContentDom = null;
  stopObservingContentChanges = null;
  constructor(spatialId, spatializedContainerObject, parentPortalInstanceObject, getExtraSpatializedElementProperties2) {
    this.spatialId = spatialId;
    this.spatializedContainerObject = spatializedContainerObject;
    this.parentPortalInstanceObject = parentPortalInstanceObject;
    this.getExtraSpatializedElementProperties = getExtraSpatializedElementProperties2;
    this.spatializedElementPromise = new Promise(
      (resolve) => {
        this.spatializedElementResolver = resolve;
      }
    );
  }
  // called when PortalSpatializedContainer is mounted
  init() {
    this.spatializedContainerObject.onSpatialTransformVisibilityChange(
      this.spatialId,
      this.onSpatialTransformVisibilityChange
    );
  }
  // called when PortalSpatializedContainer is unmounted
  destroy() {
    this.spatializedContainerObject.offSpatialTransformVisibilityChange(
      this.spatialId,
      this.onSpatialTransformVisibilityChange
    );
    if (this.pendingBitmapCapture) {
      clearTimeout(this.pendingBitmapCapture);
      this.pendingBitmapCapture = null;
    }
    if (this.spatializedElement) {
      BitmapCaptureCoordinator.clearElement(this.spatializedElement.id);
    }
    this.stopObservingContentChanges?.();
    this.observedContentDom = null;
    this.stopObservingContentChanges = null;
  }
  onSpatialTransformVisibilityChange = (spatialTransform) => {
    this.cachedTransformVisibilityInfo = {
      transformMatrix: new DOMMatrix(spatialTransform.transform),
      visibility: spatialTransform.visibility
    };
    this.updateSpatializedElementProperties();
  };
  // called when 2D frame change
  notify2DFrameChange() {
    const dom = this.spatializedContainerObject.querySpatialDomBySpatialId(
      this.spatialId
    );
    if (!dom) {
      return;
    }
    const computedStyle = getComputedStyle(dom);
    this.cachedDomInfo = {
      dom,
      computedStyle,
      isFixedPosition: computedStyle.getPropertyValue("position") === "fixed"
    };
    if (usesAndroidBitmapCapture()) {
      this.ensureContentObserver(dom);
    }
    this.updateSpatializedElementProperties();
    const __getBoundingClientCube = () => {
      return this.spatializedElement?.cubeInfo;
    };
    const __getBoundingClientRect = () => {
      if (!this.spatializedElement?.transform) {
        return null;
      }
      const domRect = new DOMRect(
        0,
        0,
        this.domRect?.width,
        this.domRect?.height
      );
      return convertDOMRectToSceneSpace(
        domRect,
        this.spatializedElement?.transform
      );
    };
    const __toSceneSpace = (point) => {
      return new DOMPoint(point.x, point.y, point.z).matrixTransform(
        this.spatializedElement?.transform
      );
    };
    const __toLocalSpace = (point) => {
      return new DOMPoint(point.x, point.y, point.z).matrixTransform(
        this.spatializedElement?.transformInv
      );
    };
    const __innerSpatializedElement = () => this.spatializedElement;
    Object.assign(dom, {
      __getBoundingClientCube,
      __getBoundingClientRect,
      __toSceneSpace,
      __toLocalSpace,
      __innerSpatializedElement
    });
  }
  ensureContentObserver(dom) {
    if (!usesAndroidBitmapCapture()) {
      return;
    }
    if (this.observedContentDom === dom && this.stopObservingContentChanges) {
      return;
    }
    this.stopObservingContentChanges?.();
    this.observedContentDom = dom;
    this.stopObservingContentChanges = observeContentChanges(dom, () => {
      this.scheduleBitmapCapture(true);
    });
  }
  async getSpatializedElement() {
    return this.spatializedElementPromise;
  }
  // called when SpatializedElement is created
  attachSpatializedElement(spatializedElement) {
    this.spatializedElement = spatializedElement;
    this.addToParent(spatializedElement);
    this.spatializedElementResolver?.(spatializedElement);
    this.updateSpatializedElementProperties();
  }
  inAddingToParent = false;
  async addToParent(spatializedElement) {
    if (this.inAddingToParent) {
      return;
    }
    this.inAddingToParent = true;
    if (this.isFixedPosition || !this.parentPortalInstanceObject) {
      var spatialScene = await getSession().getSpatialScene();
      await spatialScene.addSpatializedElement(spatializedElement);
    } else {
      const parentSpatialized2DElement = await this.parentPortalInstanceObject.getSpatializedElement();
      parentSpatialized2DElement.addSpatializedElement(spatializedElement);
    }
    this.inAddingToParent = false;
  }
  /**
   * Captures the DOM element as a bitmap for Android XR rendering.
   * Uses BitmapCaptureCoordinator to prevent duplicate captures across instances.
   * The initial capture is delayed to allow images to load.
   */
  scheduleBitmapCapture(forceRecapture = false) {
    if (!usesAndroidBitmapCapture()) return;
    if (!this.dom || !this.spatializedElement) return;
    const elementId = this.spatializedElement.id;
    if (this.captureRequested) {
      return;
    }
    this.captureRequested = true;
    if (this.pendingBitmapCapture) {
      clearTimeout(this.pendingBitmapCapture);
    }
    console.log(
      `[WebSpatial] Scheduling capture for: ${elementId} (in ${this.bitmapCaptureInitialDelayMs}ms)`
    );
    this.pendingBitmapCapture = setTimeout(async () => {
      this.pendingBitmapCapture = null;
      if (!this.dom || !this.spatializedElement) {
        console.log(`[WebSpatial] Capture cancelled - element gone: ${elementId}`);
        return;
      }
      try {
        const captureStyleId = "__webspatial_capture_style__";
        let captureStyle = document.getElementById(captureStyleId);
        if (!captureStyle) {
          captureStyle = document.createElement("style");
          captureStyle.id = captureStyleId;
          document.head.appendChild(captureStyle);
        }
        captureStyle.textContent = `
          .xr-spatial-default,
          [enable-xr],
          .xr-spatial-default * {
            visibility: visible !important;
          }
        `;
        const originalVisibility = this.dom.style.visibility;
        const originalCssText = this.dom.style.cssText;
        this.dom.style.setProperty("visibility", "visible", "important");
        const nestedSpatialElements = this.dom.querySelectorAll(".xr-spatial-default");
        const nestedOriginalVisibilities = [];
        nestedSpatialElements.forEach((el) => {
          const htmlEl = el;
          nestedOriginalVisibilities.push({
            element: htmlEl,
            visibility: htmlEl.style.visibility,
            cssText: htmlEl.style.cssText
          });
          htmlEl.style.setProperty("visibility", "visible", "important");
        });
        const fixedElements = [];
        this.dom.querySelectorAll("*").forEach((el) => {
          const htmlEl = el;
          const style = window.getComputedStyle(htmlEl);
          if (style.position === "fixed") {
            fixedElements.push({
              element: htmlEl,
              display: htmlEl.style.display
            });
            htmlEl.style.display = "none";
          }
        });
        console.log(
          `[WebSpatial] Capturing ${elementId} with ${nestedSpatialElements.length} nested spatial elements made visible, ${fixedElements.length} fixed elements hidden`
        );
        const bitmap = forceRecapture || BitmapCaptureCoordinator.hasCaptured(elementId) ? await BitmapCaptureCoordinator.requestRecapture(
          elementId,
          this.dom
        ) : await BitmapCaptureCoordinator.requestCapture(
          elementId,
          this.dom
        );
        const captureStyleToRemove = document.getElementById("__webspatial_capture_style__");
        if (captureStyleToRemove) {
          captureStyleToRemove.textContent = "";
        }
        this.dom.style.cssText = originalCssText;
        if (originalVisibility) {
          this.dom.style.visibility = originalVisibility;
        }
        nestedOriginalVisibilities.forEach(({ element, visibility, cssText }) => {
          element.style.cssText = cssText;
          if (visibility) {
            element.style.visibility = visibility;
          }
        });
        fixedElements.forEach(({ element, display }) => {
          element.style.display = display;
        });
        if (bitmap) {
          this.spatializedElement.updateProperties({ bitmap });
        }
      } catch (error) {
        console.error(`[WebSpatial] Capture failed: ${elementId}`, error);
      } finally {
        this.captureRequested = false;
      }
    }, this.bitmapCaptureInitialDelayMs);
  }
  updateSpatializedElementProperties() {
    const dom = this.dom;
    const spatializedElement = this.spatializedElement;
    const visibility = this.visibility;
    if (!dom || !spatializedElement || !visibility || !this.transformMatrix) {
      return;
    }
    const computedStyle = this.computedStyle;
    const isFixedPosition = this.isFixedPosition;
    let domRect = dom.getBoundingClientRect();
    let { x, y } = domRect;
    if (!isFixedPosition) {
      const parentDom = this.spatializedContainerObject.queryParentSpatialDomBySpatialId(
        this.spatialId
      );
      if (parentDom) {
        const parentDomRect = parentDom.getBoundingClientRect();
        x -= parentDomRect.x;
        y -= parentDomRect.y;
      } else {
        x += window.scrollX;
        y += window.scrollY;
      }
    }
    this.cachedDomRect = {
      x: domRect.x,
      y: domRect.y,
      width: domRect.width,
      height: domRect.height
    };
    const width = domRect.width;
    const height = domRect.height;
    const opacity = parseFloat(computedStyle.getPropertyValue("opacity"));
    const scrollWithParent = !isFixedPosition;
    const display = computedStyle.getPropertyValue("display");
    const visible = visibility === "visible" && display !== "none";
    const zIndex = parseFloat(
      computedStyle.getPropertyValue(SpatialCustomStyleVars.xrZIndex)
    ) || 0;
    const backOffset = parseFloat(computedStyle.getPropertyValue(SpatialCustomStyleVars.back)) || 0;
    const depth = parseFloat(
      computedStyle.getPropertyValue(SpatialCustomStyleVars.depth)
    ) || 0;
    const rotationAnchor = parseTransformOrigin(computedStyle);
    const extraProperties = this.getExtraSpatializedElementProperties?.(computedStyle) || {};
    spatializedElement.updateProperties({
      clientX: x,
      clientY: y,
      width,
      height,
      depth,
      opacity,
      scrollWithParent,
      zIndex,
      visible,
      backOffset,
      rotationAnchor,
      ...extraProperties
    });
    spatializedElement.updateTransform(this.transformMatrix);
    Object.assign(this.dom, {
      __spatializedElement: spatializedElement
    });
    if (usesAndroidBitmapCapture()) {
      this.scheduleBitmapCapture();
    }
  }
};
var PortalInstanceContext = createContext3(
  null
);

// src/spatialized-container/hooks/useSync2DFrame.ts
import { useEffect as useEffect5, useState as useState2 } from "react";
function useForceUpdate() {
  const [, setToggle] = useState2(false);
  return () => setToggle((toggle) => !toggle);
}
function useSync2DFrame(spatialId, portalInstanceObject, spatializedContainerObject) {
  const forceUpdate = useForceUpdate();
  useEffect5(() => {
    spatializedContainerObject.on2DFrameChange(spatialId, () => {
      portalInstanceObject.notify2DFrameChange();
      forceUpdate();
    });
    return () => {
      spatializedContainerObject.off2DFrameChange(spatialId);
    };
  }, []);
}

// src/spatialized-container/hooks/useSpatializedElement.ts
import { useEffect as useEffect6, useState as useState3 } from "react";
function useSpatializedElement(createSpatializedElement2, portalInstanceObject) {
  const [spatializedElement, setSpatializedElement] = useState3();
  useEffect6(() => {
    let isDestroyed = false;
    let spatializedElement2;
    createSpatializedElement2().then(
      (inSpatializedElement) => {
        if (!isDestroyed) {
          spatializedElement2 = inSpatializedElement;
          portalInstanceObject.attachSpatializedElement(spatializedElement2);
          setSpatializedElement(spatializedElement2);
        } else {
          inSpatializedElement?.destroy();
        }
      }
    );
    return () => {
      isDestroyed = true;
      if (spatializedElement2) {
        spatializedElement2.destroy();
        spatializedElement2 = void 0;
      }
    };
  }, [createSpatializedElement2, portalInstanceObject]);
  return spatializedElement;
}

// src/spatialized-container/PortalSpatializedContainer.tsx
import { Fragment, jsx as jsx3, jsxs } from "react/jsx-runtime";
function renderPlaceholderInSubPortal(portalInstanceObject, El) {
  const spatialId = portalInstanceObject.spatialId;
  const inPortalInstanceEnv = !!portalInstanceObject.parentPortalInstanceObject;
  const position = portalInstanceObject.computedStyle?.getPropertyValue("position");
  const shouldRenderPlaceHolder = inPortalInstanceEnv && portalInstanceObject && portalInstanceObject.domRect && position !== "absolute" && position !== "fixed";
  if (!shouldRenderPlaceHolder) {
    return /* @__PURE__ */ jsx3(Fragment, {});
  }
  const { width, height } = portalInstanceObject.domRect;
  const display = portalInstanceObject.computedStyle.getPropertyPriority("display");
  const spatialIdProps = { [SpatialID]: spatialId };
  return /* @__PURE__ */ jsx3(
    El,
    {
      ...spatialIdProps,
      style: {
        position: "relative",
        width: `${width}px`,
        height: `${height}px`,
        visibility: "hidden",
        display
      }
    }
  );
}
function PortalSpatializedContainer(props) {
  const {
    spatializedContent: Content,
    createSpatializedElement: createSpatializedElement2,
    getExtraSpatializedElementProperties: getExtraSpatializedElementProperties2,
    onSpatialTap,
    onSpatialDragStart,
    onSpatialDrag,
    onSpatialDragEnd,
    onSpatialRotate,
    onSpatialRotateEnd,
    onSpatialMagnify,
    onSpatialMagnifyEnd,
    [SpatialID]: spatialId,
    ...restProps
  } = props;
  const spatializedContainerObject = useContext4(
    SpatializedContainerContext
  );
  const parentPortalInstanceObject = useContext4(PortalInstanceContext);
  const portalInstanceObject = useMemo(
    () => new PortalInstanceObject(
      spatialId,
      spatializedContainerObject,
      parentPortalInstanceObject,
      getExtraSpatializedElementProperties2
    ),
    []
  );
  useEffect7(() => {
    portalInstanceObject.init();
    return () => {
      portalInstanceObject.destroy();
    };
  }, []);
  useSync2DFrame(spatialId, portalInstanceObject, spatializedContainerObject);
  const spatializedElement = useSpatializedElement(
    createSpatializedElement2,
    portalInstanceObject
  );
  const PlaceholderEl = renderPlaceholderInSubPortal(
    portalInstanceObject,
    props.component
  );
  useEffect7(() => {
    if (spatializedElement) {
      spatializedElement.onSpatialTap = onSpatialTap;
    }
  }, [spatializedElement, onSpatialTap]);
  useEffect7(() => {
    if (spatializedElement) {
      spatializedElement.onSpatialDrag = onSpatialDrag;
    }
  }, [spatializedElement, onSpatialDrag]);
  useEffect7(() => {
    if (spatializedElement) {
      spatializedElement.onSpatialDragEnd = onSpatialDragEnd;
    }
  }, [spatializedElement, onSpatialDragEnd]);
  useEffect7(() => {
    if (spatializedElement) {
      spatializedElement.onSpatialRotate = onSpatialRotate;
    }
  }, [spatializedElement, onSpatialRotate]);
  useEffect7(() => {
    if (spatializedElement) {
      spatializedElement.onSpatialRotateEnd = onSpatialRotateEnd;
    }
  }, [spatializedElement, onSpatialRotateEnd]);
  useEffect7(() => {
    if (spatializedElement) {
      spatializedElement.onSpatialMagnify = onSpatialMagnify;
    }
  }, [spatializedElement, onSpatialMagnify]);
  useEffect7(() => {
    if (spatializedElement) {
      spatializedElement.onSpatialMagnifyEnd = onSpatialMagnifyEnd;
    }
  }, [spatializedElement, onSpatialMagnifyEnd]);
  useEffect7(() => {
    if (spatializedElement) {
      spatializedElement.onSpatialDragStart = onSpatialDragStart;
    }
  }, [spatializedElement, onSpatialDragStart]);
  return /* @__PURE__ */ jsxs(PortalInstanceContext.Provider, { value: portalInstanceObject, children: [
    spatializedElement && portalInstanceObject.dom && /* @__PURE__ */ jsx3(Content, { spatializedElement, ...restProps }),
    PlaceholderEl
  ] });
}

// src/reality/context/InsideAttachmentContext.tsx
import { createContext as createContext4, useContext as useContext5 } from "react";
var InsideAttachmentContext = createContext4(false);
var useInsideAttachment = () => useContext5(InsideAttachmentContext);

// src/spatialized-container/hooks/useSpatialEvents.ts
function createEventProxy(event, currentTargetGetter, offsetXGetter, offsetYGetter, offsetZGetter, clientXGetter, clientYGetter, clientZGetter, translationXGetter, translationYGetter, translationZGetter, quaternionGetter, magnificationGetter) {
  return new Proxy(event, {
    get(target, prop) {
      if (prop === "currentTarget") {
        return currentTargetGetter();
      }
      if (prop === "isTrusted") {
        return true;
      }
      if (prop === "bubbles") {
        return false;
      }
      if (prop === "offsetX" && offsetXGetter) {
        return offsetXGetter(target) ?? 0;
      }
      if (prop === "offsetY" && offsetYGetter) {
        return offsetYGetter(target) ?? 0;
      }
      if (prop === "offsetZ" && offsetZGetter) {
        return offsetZGetter(target) ?? 0;
      }
      if (prop === "clientX" && clientXGetter) {
        return clientXGetter(target) ?? 0;
      }
      if (prop === "clientY" && clientYGetter) {
        return clientYGetter(target) ?? 0;
      }
      if (prop === "clientZ" && clientZGetter) {
        return clientZGetter(target) ?? 0;
      }
      if (prop === "translationX" && translationXGetter) {
        return translationXGetter(target) ?? 0;
      }
      if (prop === "translationY" && translationYGetter) {
        return translationYGetter(target) ?? 0;
      }
      if (prop === "translationZ" && translationZGetter) {
        return translationZGetter(target) ?? 0;
      }
      if (prop === "quaternion" && quaternionGetter) {
        return quaternionGetter(target) ?? { x: 0, y: 0, z: 0, w: 1 };
      }
      if (prop === "magnification" && magnificationGetter) {
        return magnificationGetter(target) ?? 1;
      }
      return Reflect.get(target, prop);
    }
  });
}
function createEventHandler(handler, currentTargetGetter, offsetXGetter, offsetYGetter, offsetZGetter, clientXGetter, clientYGetter, clientZGetter, translationXGetter, translationYGetter, translationZGetter, quaternionGetter, magnificationGetter) {
  return handler ? (event) => {
    const proxyEvent = createEventProxy(
      event,
      currentTargetGetter,
      offsetXGetter,
      offsetYGetter,
      offsetZGetter,
      clientXGetter,
      clientYGetter,
      clientZGetter,
      translationXGetter,
      translationYGetter,
      translationZGetter,
      quaternionGetter,
      magnificationGetter
    );
    handler(proxyEvent);
  } : void 0;
}
function useSpatialEventsBase(spatialEvents, currentTargetGetter) {
  const onSpatialTap = createEventHandler(
    spatialEvents.onSpatialTap,
    currentTargetGetter,
    // offsetX/Y/Z come from local coordinates
    (ev) => ev.detail?.location3D?.x,
    (ev) => ev.detail?.location3D?.y,
    (ev) => ev.detail?.location3D?.z,
    // clientX/Y/Z come from global scene coordinates
    (ev) => ev.detail?.globalLocation3D?.x,
    (ev) => ev.detail?.globalLocation3D?.y,
    (ev) => ev.detail?.globalLocation3D?.z
  );
  const onSpatialDrag = createEventHandler(
    spatialEvents.onSpatialDrag,
    currentTargetGetter,
    void 0,
    void 0,
    void 0,
    void 0,
    void 0,
    void 0,
    (ev) => ev.detail?.translation3D?.x,
    (ev) => ev.detail?.translation3D?.y,
    (ev) => ev.detail?.translation3D?.z
  );
  const onSpatialDragEnd = createEventHandler(
    spatialEvents.onSpatialDragEnd,
    currentTargetGetter
  );
  const onSpatialRotate = createEventHandler(
    spatialEvents.onSpatialRotate,
    currentTargetGetter,
    void 0,
    void 0,
    void 0,
    void 0,
    void 0,
    void 0,
    void 0,
    void 0,
    void 0,
    (ev) => ev.detail?.quaternion
  );
  const onSpatialRotateEnd = createEventHandler(
    spatialEvents.onSpatialRotateEnd,
    currentTargetGetter
  );
  const onSpatialMagnify = createEventHandler(
    spatialEvents.onSpatialMagnify,
    currentTargetGetter,
    void 0,
    void 0,
    void 0,
    void 0,
    void 0,
    void 0,
    void 0,
    void 0,
    void 0,
    void 0,
    (ev) => ev.detail?.magnification
  );
  const onSpatialMagnifyEnd = createEventHandler(
    spatialEvents.onSpatialMagnifyEnd,
    currentTargetGetter
  );
  const onSpatialDragStart = createEventHandler(
    spatialEvents.onSpatialDragStart,
    currentTargetGetter,
    (ev) => ev.detail?.startLocation3D?.x,
    (ev) => ev.detail?.startLocation3D?.y,
    (ev) => ev.detail?.startLocation3D?.z,
    (ev) => ev.detail?.globalLocation3D?.x,
    (ev) => ev.detail?.globalLocation3D?.y,
    (ev) => ev.detail?.globalLocation3D?.z
  );
  return {
    onSpatialTap,
    onSpatialDragStart,
    onSpatialDrag,
    onSpatialDragEnd,
    onSpatialRotate,
    onSpatialRotateEnd,
    onSpatialMagnify,
    onSpatialMagnifyEnd
  };
}
function useSpatialEvents(spatialEvents, spatialContainerRefProxy) {
  return useSpatialEventsBase(
    spatialEvents,
    () => spatialContainerRefProxy.current?.domProxy
  );
}
function useSpatialEventsWhenSpatializedContainerExist(spatialEvents, spatialId, spatializedContainerObject) {
  return useSpatialEventsBase(spatialEvents, () => {
    const spatialContainerRefProxy = spatializedContainerObject.getSpatialContainerRefProxyBySpatialId(
      spatialId
    );
    return spatialContainerRefProxy?.domProxy;
  });
}

// src/ssr/SSRContext.tsx
import { createContext as createContext5, useState as useState4, useEffect as useEffect8 } from "react";
import { jsx as jsx4 } from "react/jsx-runtime";
var SSRContext = createContext5(false);
var SSRProvider = ({
  isSSR: initialIsSSR = true,
  children
}) => {
  const [isSSR, setIsSSR] = useState4(initialIsSSR);
  useEffect8(() => {
    if (isSSR) {
      setIsSSR(false);
    }
  }, []);
  return /* @__PURE__ */ jsx4(SSRContext.Provider, { value: isSSR, children });
};

// src/ssr/withSSRSupported.tsx
import { forwardRef as forwardRef3 } from "react";

// src/ssr/useSSRPhase.tsx
import { useContext as useContext6, useState as useState5, useEffect as useEffect9 } from "react";
function useSSRPhase() {
  const isSSRContext = useContext6(SSRContext);
  const isServer = typeof window === "undefined";
  const [hydrated, setHydrated] = useState5(false);
  useEffect9(() => setHydrated(true), []);
  if (isServer) {
    return "ssr";
  }
  if (isSSRContext) {
    return hydrated ? "after-hydrate" : "hydrate";
  } else {
    return "after-hydrate";
  }
}

// src/ssr/withSSRSupported.tsx
import { jsx as jsx5 } from "react/jsx-runtime";
function withSSRSupported(Component) {
  const ClientOnlyComponent = (props, ref) => {
    const phase = useSSRPhase();
    let renderType = "real";
    if (phase === "ssr" || phase === "hydrate") {
      renderType = "fake";
    }
    if (renderType === "fake") {
      const { style, className } = props;
      return /* @__PURE__ */ jsx5("div", { style, className, ref });
    } else {
      return /* @__PURE__ */ jsx5(Component, { ...props, ref });
    }
  };
  ClientOnlyComponent.displayName = `withClientOnly(${Component.displayName || Component.name || "Component"})`;
  return forwardRef3(ClientOnlyComponent);
}

// src/spatialized-container/SpatializedContainer.tsx
import { jsx as jsx6, jsxs as jsxs2 } from "react/jsx-runtime";
function DegradedContainer({
  innerRef,
  ...inprops
}) {
  const {
    component: Component,
    children,
    ["enable-xr"]: _enableXR,
    onSpatialTap: _onSpatialTap,
    onSpatialDragStart: _onSpatialDragStart,
    onSpatialDrag: _onSpatialDrag,
    onSpatialDragEnd: _onSpatialDragEnd,
    onSpatialRotate: _onSpatialRotate,
    onSpatialRotateEnd: _onSpatialRotateEnd,
    onSpatialMagnify: _onSpatialMagnify,
    onSpatialMagnifyEnd: _onSpatialMagnifyEnd,
    spatializedContent: _content,
    createSpatializedElement: _create,
    getExtraSpatializedElementProperties: _getExtra,
    extraRefProps: _extraRef,
    sizingMode: _sizingMode,
    ...restProps
  } = inprops;
  return /* @__PURE__ */ jsx6(Component, { ref: innerRef, ...restProps, children });
}
function SpatializedContainerBase(inprops, ref) {
  const isWebSpatialEnv = getSession() !== null;
  const insideAttachment = useInsideAttachment();
  if (!isWebSpatialEnv || insideAttachment) {
    if (insideAttachment) {
      console.warn(
        `[WebSpatial] ${inprops.component || "Spatial element"} cannot be used inside AttachmentAsset. Rendering as plain HTML.`
      );
    }
    return /* @__PURE__ */ jsx6(DegradedContainer, { ...inprops, innerRef: ref });
  }
  const layer = useContext7(SpatialLayerContext) + 1;
  const rootSpatializedContainerObject = useContext7(
    SpatializedContainerContext
  );
  const inSpatializedContainer = !!rootSpatializedContainerObject;
  const portalInstanceObject = useContext7(PortalInstanceContext);
  const inPortalInstanceEnv = !!portalInstanceObject;
  const isInStandardInstance = !inPortalInstanceEnv;
  const spatialId = useMemo2(() => {
    return !inSpatializedContainer ? `root_container` : rootSpatializedContainerObject.getSpatialId(layer, isInStandardInstance);
  }, []);
  const spatialIdProps = {
    [SpatialID]: spatialId
  };
  const {
    onSpatialTap,
    onSpatialDragStart,
    onSpatialDrag,
    onSpatialDragEnd,
    onSpatialRotate,
    onSpatialRotateEnd,
    onSpatialMagnify,
    onSpatialMagnifyEnd,
    extraRefProps,
    ...props
  } = inprops;
  if (inSpatializedContainer) {
    if (inPortalInstanceEnv) {
      const spatialEvents = useSpatialEventsWhenSpatializedContainerExist(
        {
          onSpatialTap,
          onSpatialDragStart,
          onSpatialDrag,
          onSpatialDragEnd,
          onSpatialRotate,
          onSpatialRotateEnd,
          onSpatialMagnify,
          onSpatialMagnifyEnd
        },
        spatialId,
        rootSpatializedContainerObject
      );
      return /* @__PURE__ */ jsx6(SpatialLayerContext.Provider, { value: layer, children: /* @__PURE__ */ jsx6(
        PortalSpatializedContainer,
        {
          ...spatialIdProps,
          ...props,
          ...spatialEvents
        }
      ) });
    } else {
      const {
        transformVisibilityTaskContainerCallback,
        standardSpatializedContainerCallback,
        spatialContainerRefProxy
      } = useDomProxy(ref, extraRefProps);
      useEffect10(() => {
        rootSpatializedContainerObject.updateSpatialContainerRefProxyInfo(
          spatialId,
          spatialContainerRefProxy.current
        );
      }, [spatialContainerRefProxy.current]);
      const {
        spatializedContent,
        createSpatializedElement: createSpatializedElement2,
        getExtraSpatializedElementProperties: getExtraSpatializedElementProperties2,
        ...restProps
      } = props;
      return /* @__PURE__ */ jsxs2(SpatialLayerContext.Provider, { value: layer, children: [
        /* @__PURE__ */ jsx6(
          StandardSpatializedContainer,
          {
            ref: standardSpatializedContainerCallback,
            ...spatialIdProps,
            ...restProps,
            inStandardSpatializedContainer: true
          }
        ),
        /* @__PURE__ */ jsx6(
          TransformVisibilityTaskContainer,
          {
            ref: transformVisibilityTaskContainerCallback,
            ...spatialIdProps,
            className: props.className,
            style: props.style
          }
        )
      ] });
    }
  } else {
    const {
      transformVisibilityTaskContainerCallback,
      standardSpatializedContainerCallback,
      spatialContainerRefProxy
    } = useDomProxy(ref, extraRefProps);
    const spatialEvents = useSpatialEvents(
      {
        onSpatialTap,
        onSpatialDragStart,
        onSpatialDrag,
        onSpatialDragEnd,
        onSpatialRotate,
        onSpatialRotateEnd,
        onSpatialMagnify,
        onSpatialMagnifyEnd
      },
      spatialContainerRefProxy
    );
    const spatializedContainerObject = useMemo2(
      () => new SpatializedContainerObject(),
      []
    );
    const {
      spatializedContent,
      createSpatializedElement: createSpatializedElement2,
      getExtraSpatializedElementProperties: getExtraSpatializedElementProperties2,
      ...restProps
    } = props;
    return /* @__PURE__ */ jsx6(SpatialLayerContext.Provider, { value: layer, children: /* @__PURE__ */ jsxs2(
      SpatializedContainerContext.Provider,
      {
        value: spatializedContainerObject,
        children: [
          /* @__PURE__ */ jsx6(
            StandardSpatializedContainer,
            {
              ref: standardSpatializedContainerCallback,
              ...spatialIdProps,
              ...restProps,
              inStandardSpatializedContainer: false
            }
          ),
          /* @__PURE__ */ jsx6(
            PortalSpatializedContainer,
            {
              ...spatialIdProps,
              ...props,
              ...spatialEvents
            }
          ),
          /* @__PURE__ */ jsx6(
            TransformVisibilityTaskContainer,
            {
              ref: transformVisibilityTaskContainerCallback,
              ...spatialIdProps,
              className: props.className,
              style: props.style
            }
          )
        ]
      }
    ) });
  }
}
var SpatializedContainer = withSSRSupported(
  forwardRef4(SpatializedContainerBase)
);

// src/spatialized-container/Spatialized2DElementContainer.tsx
import { createPortal as createPortal2 } from "react-dom";
import {
  forwardRef as forwardRef5,
  useContext as useContext8,
  useEffect as useEffect12
} from "react";

// src/utils/windowStyleSync.ts
function ensureWindowDocumentStructure(openedWindow) {
  try {
    const { document: document2 } = openedWindow;
    let documentElement = document2.documentElement;
    if (!documentElement) {
      documentElement = document2.createElement("html");
      document2.appendChild(documentElement);
    }
    let head = document2.head;
    if (!head) {
      head = document2.createElement("head");
      if (documentElement.firstChild) {
        documentElement.insertBefore(head, documentElement.firstChild);
      } else {
        documentElement.appendChild(head);
      }
    }
    let body = document2.body;
    if (!body) {
      body = document2.createElement("body");
      documentElement.appendChild(body);
    }
    return {
      document: document2,
      documentElement,
      head,
      body
    };
  } catch (error) {
    console.warn(
      "[WebSpatial] Failed to ensure child window document structure",
      error
    );
    return null;
  }
}
function asyncLoadStyleToChildWindow(childWindow, link, isCurrent) {
  return new Promise((resolve) => {
    const { href } = link;
    const sep = href.includes("?") ? "&" : "?";
    link.href = `${href}${sep}uniqueURL=${Math.random()}`;
    let finished = false;
    const finish = (ok) => {
      if (finished) return;
      finished = true;
      resolve(ok);
    };
    link.onerror = () => {
      finish(false);
    };
    link.onload = () => {
      if (!isCurrent()) {
        link.parentNode?.removeChild(link);
        finish(false);
        return;
      }
      finish(true);
    };
    setTimeout(() => {
      if (!isCurrent()) {
        finish(false);
        return;
      }
      const childDocument = ensureWindowDocumentStructure(childWindow);
      if (!childDocument) {
        finish(false);
        return;
      }
      childDocument.head.appendChild(link);
    }, 50);
  });
}
var WEBSPATIAL_SYNC_ATTR = "data-webspatial-sync";
var WEBSPATIAL_SYNC_KEY_ATTR = "data-webspatial-sync-key";
function setOpenWindowStyle(openedWindow) {
  const childDocument = ensureWindowDocumentStructure(openedWindow);
  if (!childDocument) return;
  childDocument.documentElement.style.cssText += document.documentElement.style.cssText;
  childDocument.documentElement.style.backgroundColor = "transparent";
  childDocument.body.style.margin = "0px";
  childDocument.body.style.display = "inline-block";
  childDocument.body.style.minWidth = "auto";
  childDocument.body.style.minHeight = "auto";
  childDocument.body.style.maxWidth = "fit-content";
  childDocument.body.style.minWidth = "fit-content";
  childDocument.body.style.background = "transparent";
}
var controllers = /* @__PURE__ */ new WeakMap();
function getController(childWindow) {
  const prev = controllers.get(childWindow);
  if (prev) return prev;
  const next = { version: 0 };
  controllers.set(childWindow, next);
  return next;
}
async function syncParentHeadToChild(childWindow) {
  const controller = getController(childWindow);
  const version2 = ++controller.version;
  const styleLoadedPromises = [];
  const childDocument = ensureWindowDocumentStructure(childWindow);
  if (!childDocument) {
    return [];
  }
  const { head } = childDocument;
  const isCurrent = () => controller.version === version2;
  const parentStyles = Array.from(document.head.querySelectorAll("style"));
  const parentStylesheets = Array.from(
    document.head.querySelectorAll('link[rel="stylesheet"][href]')
  );
  const desiredStylesheetKeys = /* @__PURE__ */ new Set();
  for (const link of parentStylesheets) {
    if (link.href) desiredStylesheetKeys.add(link.href);
  }
  const existingSyncedLinks = Array.from(
    head.querySelectorAll(
      `link[rel="stylesheet"][${WEBSPATIAL_SYNC_ATTR}="1"]`
    )
  );
  for (const link of existingSyncedLinks) {
    const key = link.getAttribute(WEBSPATIAL_SYNC_KEY_ATTR) ?? link.href;
    if (!desiredStylesheetKeys.has(key)) link.parentNode?.removeChild(link);
  }
  const prevSyncedStyles = head.querySelectorAll(
    `style[${WEBSPATIAL_SYNC_ATTR}="1"]`
  );
  prevSyncedStyles.forEach((n) => n.parentNode?.removeChild(n));
  for (const styleEl of parentStyles) {
    const node = styleEl.cloneNode(true);
    node.setAttribute(WEBSPATIAL_SYNC_ATTR, "1");
    head.appendChild(node);
  }
  const currentKeys = /* @__PURE__ */ new Set();
  const currentSyncedLinks = Array.from(
    head.querySelectorAll(
      `link[rel="stylesheet"][${WEBSPATIAL_SYNC_ATTR}="1"]`
    )
  );
  for (const link of currentSyncedLinks) {
    currentKeys.add(link.getAttribute(WEBSPATIAL_SYNC_KEY_ATTR) ?? link.href);
  }
  for (const link of parentStylesheets) {
    const key = link.href;
    if (!key || currentKeys.has(key)) continue;
    const node = link.cloneNode(true);
    node.setAttribute(WEBSPATIAL_SYNC_ATTR, "1");
    node.setAttribute(WEBSPATIAL_SYNC_KEY_ATTR, key);
    styleLoadedPromises.push(
      asyncLoadStyleToChildWindow(childWindow, node, isCurrent)
    );
  }
  childDocument.documentElement.className = document.documentElement.className;
  return Promise.all(styleLoadedPromises);
}

// src/utils/useSyncHeadStyles.ts
import { useEffect as useEffect11 } from "react";
function defaultShouldSync(mutations) {
  if (!Array.isArray(mutations) || mutations.length === 0) return false;
  for (const mutation of mutations) {
    const nodes = [
      ...Array.from(mutation.addedNodes),
      ...Array.from(mutation.removedNodes)
    ];
    for (const node of nodes) {
      if (!(node instanceof Element)) continue;
      const tag = node.tagName;
      if (tag === "STYLE") return true;
      if (tag === "LINK") {
        const { rel } = node;
        if (rel && rel.toLowerCase() === "stylesheet") return true;
      }
    }
  }
  return false;
}
function useSyncHeadStyles(childWindow, options) {
  const delayMs = 100;
  const subtree = options?.subtree ?? false;
  const immediate = options?.immediate ?? true;
  useEffect11(() => {
    if (!childWindow) return;
    let timer;
    const scheduleSync = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        syncParentHeadToChild(childWindow);
      }, delayMs);
    };
    if (immediate) scheduleSync();
    const observer = new MutationObserver((mutations) => {
      if (!defaultShouldSync(mutations)) return;
      scheduleSync();
    });
    observer.observe(document.head, { childList: true, subtree });
    return () => {
      if (timer) window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [childWindow, delayMs, subtree, immediate]);
}

// src/spatialized-container/Spatialized2DElementContainer.tsx
import { jsx as jsx7 } from "react/jsx-runtime";
function getJSXPortalInstance(inProps, portalInstanceObject) {
  const { component: El, style: inStyle = {}, ...props } = inProps;
  const extraStyle = {
    visibility: "visible",
    position: "relative",
    top: "0px",
    left: "0px",
    margin: "0px",
    marginLeft: "0px",
    marginRight: "0px",
    marginTop: "0px",
    marginBottom: "0px",
    borderRadius: "0px",
    // overflow: '',
    transform: "none"
  };
  const computedStyle = portalInstanceObject.computedStyle;
  const inheritedPortalStyle = getInheritedStyleProps(computedStyle);
  const style = {
    ...inStyle,
    ...inheritedPortalStyle,
    ...extraStyle
  };
  return /* @__PURE__ */ jsx7(El, { style, ...props });
}
function useSyncDocumentTitle(windowProxy, spatializedElement, name) {
  useEffect12(() => {
    const childDocument = ensureWindowDocumentStructure(windowProxy);
    if (!childDocument) return;
    childDocument.document.title = name;
    spatializedElement.updateProperties({
      name
    });
  }, [name]);
}
function SpatializedContent(props) {
  const { spatializedElement, ...restProps } = props;
  const spatialized2DElement = spatializedElement;
  const { windowProxy } = spatialized2DElement;
  const isAndroidBitmapMode = usesAndroidBitmapCapture();
  useSyncHeadStyles(isAndroidBitmapMode ? null : windowProxy, {
    subtree: false
  });
  const name = restProps["data-name"] || "";
  useSyncDocumentTitle(windowProxy, spatialized2DElement, name);
  const portalInstanceObject = useContext8(
    PortalInstanceContext
  );
  if (isAndroidBitmapMode) {
    return null;
  }
  const childDocument = ensureWindowDocumentStructure(windowProxy);
  if (!childDocument?.body) {
    return null;
  }
  const JSXPortalInstance = getJSXPortalInstance(
    restProps,
    portalInstanceObject
  );
  return createPortal2(JSXPortalInstance, childDocument.body);
}
function getExtraSpatializedElementProperties(computedStyle) {
  const overflow = computedStyle.getPropertyValue("overflow");
  const scrollPageEnabled = ["visible", "hidden", "clip"].indexOf(overflow) >= 0;
  const material = computedStyle.getPropertyValue(
    SpatialCustomStyleVars.backgroundMaterial
  );
  const properties = {};
  properties.scrollPageEnabled = scrollPageEnabled;
  properties.cornerRadius = parseCornerRadius(computedStyle);
  if (material) {
    properties.material = material;
  }
  return properties;
}
async function createSpatializedElement() {
  const spatializedElement = await getSession().createSpatialized2DElement();
  const windowProxy = spatializedElement.windowProxy;
  if (usesAndroidBitmapCapture()) {
    console.log(
      "[WebSpatial] Android: Skipping WindowProxy setup, using bitmap capture"
    );
    return spatializedElement;
  }
  setOpenWindowStyle(windowProxy);
  await syncParentHeadToChild(windowProxy);
  const childDocument = ensureWindowDocumentStructure(windowProxy);
  if (!childDocument) {
    return spatializedElement;
  }
  const viewport = childDocument.document.querySelector('meta[name="viewport"]');
  if (viewport) {
    viewport?.setAttribute(
      "content",
      " initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
    );
  } else {
    const meta = childDocument.document.createElement("meta");
    meta.name = "viewport";
    meta.content = "initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
    childDocument.head.appendChild(meta);
  }
  return spatializedElement;
}
function Spatialized2DElementContainerBase(props, ref) {
  return /* @__PURE__ */ jsx7(
    SpatializedContainer,
    {
      ref,
      createSpatializedElement,
      getExtraSpatializedElementProperties,
      spatializedContent: SpatializedContent,
      ...props
    }
  );
}
var Spatialized2DElementContainer = forwardRef5(
  Spatialized2DElementContainerBase
);

// src/spatialized-container/SpatializedStatic3DElementContainer.tsx
import {
  forwardRef as forwardRef6,
  useCallback as useCallback6,
  useContext as useContext9,
  useEffect as useEffect13,
  useMemo as useMemo3,
  useRef as useRef4
} from "react";
import { Fragment as Fragment2, jsx as jsx8 } from "react/jsx-runtime";
function getAbsoluteURL(url) {
  if (!url) {
    return "";
  }
  try {
    return new URL(url, document.baseURI).toString();
  } catch {
    return url;
  }
}
function createLoadEvent(type, targetGetter) {
  const event = new CustomEvent(type, {
    bubbles: false,
    cancelable: false
  });
  const proxyEvent = new Proxy(event, {
    get(target, prop) {
      if (prop === "target") {
        return targetGetter();
      }
      return Reflect.get(target, prop);
    }
  });
  return proxyEvent;
}
function createLoadFailureEvent(targetGetter) {
  return createLoadEvent("modelloadfailed", targetGetter);
}
function createLoadSuccessEvent(targetGetter) {
  return createLoadEvent("modelloaded", targetGetter);
}
function SpatializedContent2(props) {
  const { src, spatializedElement, onLoad, onError } = props;
  const spatializedStatic3DElement = spatializedElement;
  const portalInstanceObject = useContext9(
    PortalInstanceContext
  );
  const currentSrc = useMemo3(() => getAbsoluteURL(src), [src]);
  useEffect13(() => {
    if (src) {
      spatializedStatic3DElement.updateProperties({ modelURL: currentSrc });
    }
  }, [currentSrc]);
  useEffect13(() => {
    if (onLoad) {
      spatializedStatic3DElement.onLoadCallback = () => {
        onLoad(
          createLoadSuccessEvent(
            () => portalInstanceObject.dom.__targetProxy
          )
        );
      };
    } else {
      spatializedStatic3DElement.onLoadCallback = void 0;
    }
  }, [onLoad]);
  useEffect13(() => {
    if (onError) {
      spatializedStatic3DElement.onLoadFailureCallback = () => {
        onError(
          createLoadFailureEvent(
            () => portalInstanceObject.dom.__targetProxy
          )
        );
      };
    } else {
      spatializedStatic3DElement.onLoadFailureCallback = void 0;
    }
  }, [onError]);
  return /* @__PURE__ */ jsx8(Fragment2, {});
}
function SpatializedStatic3DElementContainerBase(props, ref) {
  const promiseRef = useRef4(null);
  const createSpatializedElement2 = useCallback6(() => {
    const url = getAbsoluteURL(props.src);
    promiseRef.current = getSession().createSpatializedStatic3DElement(url);
    return promiseRef.current;
  }, []);
  const extraRefProps = useCallback6(
    (domProxy) => {
      let modelTransform = new DOMMatrixReadOnly();
      return {
        get currentSrc() {
          return getAbsoluteURL(props.src);
        },
        get ready() {
          return promiseRef.current.then((spatializedElement) => spatializedElement.ready).then((success) => {
            if (success) return createLoadSuccessEvent(() => domProxy);
            throw createLoadFailureEvent(() => domProxy);
          });
        },
        get entityTransform() {
          return modelTransform;
        },
        set entityTransform(value) {
          modelTransform = value;
          const spatializedElement = domProxy.__spatializedElement;
          spatializedElement?.updateModelTransform(modelTransform);
        }
      };
    },
    []
  );
  return /* @__PURE__ */ jsx8(
    SpatializedContainer,
    {
      ref,
      component: "div",
      createSpatializedElement: createSpatializedElement2,
      spatializedContent: SpatializedContent2,
      extraRefProps,
      ...props
    }
  );
}
var SpatializedStatic3DElementContainer = forwardRef6(
  SpatializedStatic3DElementContainerBase
);

// src/spatialized-container/Spatialized2DElementContainerFactory.tsx
import { forwardRef as forwardRef7 } from "react";
import { jsx as jsx9 } from "react/jsx-runtime";
var CachedSpatialized2DElementContainerType = /* @__PURE__ */ new Map();
function withSpatialized2DElementContainer(Component) {
  if (CachedSpatialized2DElementContainerType.has(Component)) {
    return CachedSpatialized2DElementContainerType.get(Component);
  } else {
    const TypedSpatialized2DElementContainer = forwardRef7(
      (givenProps, ref) => {
        const { component: ignoreComponent, ...props } = givenProps;
        return /* @__PURE__ */ jsx9(
          Spatialized2DElementContainer,
          {
            component: Component,
            ...props,
            ref
          }
        );
      }
    );
    CachedSpatialized2DElementContainerType.set(
      Component,
      TypedSpatialized2DElementContainer
    );
    CachedSpatialized2DElementContainerType.set(
      TypedSpatialized2DElementContainer,
      TypedSpatialized2DElementContainer
    );
    return TypedSpatialized2DElementContainer;
  }
}

// src/spatialized-container/index.ts
function initPolyfill() {
  hijackGetComputedStyle();
  injectSpatialDefaultStyle();
  initCSSParserDivContainer();
}

// src/initScene.ts
function initScene(name, callback, options) {
  return getSession()?.initScene(name, callback, options);
}

// src/spatialized-container-monitor/withSpatialMonitor.tsx
import { forwardRef as forwardRef9 } from "react";

// src/spatialized-container-monitor/useMonitorDomChange.tsx
import { useRef as useRef5, useEffect as useEffect14, useMemo as useMemo4 } from "react";
function useMonitorDomChange(inRef) {
  const ref = useRef5(null);
  useEffect14(() => {
    const observer = new MutationObserver((mutationsList) => {
      notifyDOMUpdate(mutationsList);
    });
    const config = {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"]
    };
    ref.current && observer.observe(ref.current, config);
    return () => {
      observer.disconnect();
    };
  }, []);
  const proxyRef = useMemo4(
    () => new Proxy(ref, {
      set: function(target, key, value) {
        if (key === "current") {
          if (inRef) {
            if (typeof inRef === "function") {
              inRef(value);
            } else if (inRef) {
              inRef.current = value;
            }
          }
        }
        return Reflect.set(target, key, value);
      }
    }),
    []
  );
  return proxyRef;
}

// src/spatialized-container-monitor/useMonitorDocumentHeaderChange.tsx
import { useEffect as useEffect15 } from "react";
function useMonitorDocumentHeaderChange() {
  useEffect15(() => {
    const observer = new MutationObserver((mutationsList) => {
      notifyUpdateStandInstanceLayout();
    });
    const config = {
      childList: true,
      subtree: true,
      attributes: true
    };
    observer.observe(document.head, config);
    return () => {
      observer.disconnect();
    };
  }, []);
}

// src/spatialized-container-monitor/SpatialMonitor.tsx
import { forwardRef as forwardRef8 } from "react";
import { jsx as jsx10 } from "react/jsx-runtime";
function SpatialMonitorBase(inProps, inRef) {
  const { El = "div", ...props } = inProps;
  const ref = useMonitorDomChange(inRef);
  useMonitorDocumentHeaderChange();
  return /* @__PURE__ */ jsx10(El, { ...props, ref });
}
var SpatialMonitor = forwardRef8(SpatialMonitorBase);

// src/spatialized-container-monitor/withSpatialMonitor.tsx
import { jsx as jsx11 } from "react/jsx-runtime";
var cachedWithSpatialMonitorType = /* @__PURE__ */ new Map();
function withSpatialMonitor(El) {
  if (cachedWithSpatialMonitorType.has(El)) {
    return cachedWithSpatialMonitorType.get(El);
  } else {
    const WithSpatialMonitorComponent = forwardRef9(
      (givenProps, givenRef) => {
        const {
          El: _,
          ...props
        } = givenProps;
        return /* @__PURE__ */ jsx11(SpatialMonitor, { El, ...props, ref: givenRef });
      }
    );
    WithSpatialMonitorComponent.displayName = `WithSpatialMonitor(${typeof El === "string" ? El : El.displayName || El.name})`;
    cachedWithSpatialMonitorType.set(El, WithSpatialMonitorComponent);
    cachedWithSpatialMonitorType.set(
      cachedWithSpatialMonitorType,
      cachedWithSpatialMonitorType
    );
    return WithSpatialMonitorComponent;
  }
}

// src/reality/components/Entity.tsx
import { forwardRef as forwardRef11 } from "react";

// src/reality/components/BaseEntity.tsx
import { forwardRef as forwardRef10 } from "react";

// src/reality/context/RealityContext.tsx
import { createContext as createContext6, useContext as useContext10 } from "react";
var RealityContext = createContext6(null);
var useRealityContext = () => useContext10(RealityContext);

// src/reality/context/ParentContext.tsx
import { createContext as createContext7, useContext as useContext11 } from "react";
var ParentContext = createContext7(null);
var useParentContext = () => useContext11(ParentContext);

// src/reality/context/AttachmentContext.tsx
import { createContext as createContext8, useContext as useContext12 } from "react";
var AttachmentRegistry = class {
  // name → (instanceId → container)
  containers = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Map();
  addContainer(name, instanceId, container) {
    if (!this.containers.has(name)) {
      this.containers.set(name, /* @__PURE__ */ new Map());
    }
    this.containers.get(name).set(instanceId, container);
    this.notifyListeners(name);
  }
  removeContainer(name, instanceId) {
    this.containers.get(name)?.delete(instanceId);
    if (this.containers.get(name)?.size === 0) {
      this.containers.delete(name);
    }
    this.notifyListeners(name);
  }
  getContainers(name) {
    const map = this.containers.get(name);
    return map ? Array.from(map.values()) : [];
  }
  onContainersChange(name, cb) {
    const current = this.getContainers(name);
    if (current.length > 0) {
      cb(current);
    }
    const prev = this.listeners.get(name);
    if (prev) prev([]);
    this.listeners.set(name, cb);
    return () => {
      if (this.listeners.get(name) === cb) {
        this.listeners.delete(name);
      }
    };
  }
  notifyListeners(name) {
    const cs = this.getContainers(name);
    this.listeners.get(name)?.(cs);
  }
  destroy() {
    this.containers.clear();
    this.listeners.clear();
  }
};
var AttachmentContext = createContext8(null);

// src/reality/hooks/useEntityTransform.tsx
import { useEffect as useEffect16, useRef as useRef6 } from "react";

// src/reality/utils/ResourceRegistry.ts
var ResourceRegistry = class {
  resources = /* @__PURE__ */ new Map();
  add(id, resource) {
    this.resources.set(id, resource);
  }
  remove(id) {
    this.resources.delete(id);
  }
  // Remove the resource by id and destroy it once resolved
  // This does not cancel in-flight creation; it schedules destruction after resolution
  removeAndDestroy(id) {
    const p = this.resources.get(id);
    if (p) {
      p.then((spatialObj) => spatialObj.destroy()).catch(() => {
      });
    }
    this.resources.delete(id);
  }
  get(id) {
    return this.resources.get(id);
  }
  destroy() {
    const pending = Array.from(this.resources.values());
    this.resources.clear();
    pending.forEach(
      (promise) => promise.then((spatialObj) => spatialObj.destroy()).catch(() => {
      })
    );
  }
};

// src/reality/utils/equal.ts
function shallowEqualVec3(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.z === b.z;
}
function shallowEqualRotation(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.z === b.z && ("w" in a ? a.w === b.w : true);
}

// src/reality/utils/AbortResourceManager.ts
var AbortResourceManager = class {
  constructor(signal) {
    this.signal = signal;
    signal.addEventListener("abort", () => {
      this.aborted = true;
      void this.dispose();
    });
  }
  resources = [];
  aborted = false;
  async addResource(factory) {
    if (this.aborted) throw new DOMException("Aborted", "AbortError");
    const resource = await factory();
    if (this.aborted) {
      await resource.destroy();
      throw new DOMException("Aborted", "AbortError");
    }
    this.resources.push(resource);
    return resource;
  }
  async dispose() {
    const resources = this.resources.splice(0);
    for (const r of resources) {
      try {
        await r.destroy();
      } catch (e) {
        console.error("AbortResourceManager dispose error:", e, r);
      }
    }
  }
};

// src/reality/hooks/useEntityTransform.tsx
function useEntityTransform(entity, { position, rotation, scale }) {
  const last = useRef6({});
  useEffect16(() => {
    if (!entity) return;
    const shouldUpdate = !shallowEqualVec3(last.current.position, position) || !shallowEqualRotation(last.current.rotation, rotation) || !shallowEqualVec3(last.current.scale, scale);
    if (!shouldUpdate) return;
    last.current = { position, rotation, scale };
    const updateTransform = async () => {
      try {
        await entity.updateTransform({ position, rotation, scale });
      } catch (err) {
        console.error("[useEntityTransform] Failed to update transform:", err);
      }
    };
    updateTransform();
    return () => {
    };
  }, [entity, position, rotation, scale]);
}

// src/reality/hooks/useEntityEvent.tsx
import { useEffect as useEffect18, useRef as useRef8 } from "react";

// src/reality/type.ts
var eventMap = {
  // tap
  onSpatialTap: "spatialtap",
  // drag
  onSpatialDragStart: "spatialdragstart",
  onSpatialDrag: "spatialdrag",
  onSpatialDragEnd: "spatialdragend",
  // rotate
  onSpatialRotateStart: "spatialrotatestart",
  onSpatialRotate: "spatialrotate",
  onSpatialRotateEnd: "spatialrotateend",
  // magnify
  onSpatialMagnifyStart: "spatialmagnifystart",
  onSpatialMagnify: "spatialmagnify",
  onSpatialMagnifyEnd: "spatialmagnifyend"
};

// src/reality/hooks/useEntityRef.tsx
import { useImperativeHandle } from "react";
var useEntityRef = (ref, instance) => {
  useImperativeHandle(ref, () => instance);
};
var EntityRef = class {
  _entity;
  _ctx;
  constructor(entity = null, ctx = null) {
    this._entity = entity;
    this._ctx = ctx;
  }
  updateEntity(entity) {
    if (entity) this._entity = entity;
  }
  updateCtx(ctx) {
    if (ctx) this._ctx = ctx;
  }
  destroy() {
    this._entity?.destroy();
  }
  get entity() {
    return this._entity;
  }
  get id() {
    return this._entity?.userData?.id;
  }
  get name() {
    return this._entity?.userData?.name;
  }
  async convertFromEntityToEntity(fromEntityId, toEntityId, position) {
    if (!this._entity) return position;
    try {
      const fromEnt = await this._ctx?.resourceRegistry.get(fromEntityId);
      const toEnt = await this._ctx?.resourceRegistry.get(toEntityId);
      if (!fromEnt || !toEnt) return position;
      const ret = await this._entity.convertFromEntityToEntity(
        fromEnt.id,
        toEnt.id,
        position
      );
      return ret?.data ?? position;
    } catch {
      return position;
    }
  }
  async convertFromEntityToReality(entityId, position) {
    if (!this._entity) return position;
    try {
      const ent = await this._ctx?.resourceRegistry.get(entityId);
      if (!ent) return position;
      const ret = await this._entity.convertFromEntityToScene(ent.id, position);
      return ret?.data ?? position;
    } catch {
      return position;
    }
  }
  async convertFromRealityToEntity(entityId, position) {
    if (!this._entity) return position;
    try {
      const ent = await this._ctx?.resourceRegistry.get(entityId);
      if (!ent) return position;
      const ret = await this._entity.convertFromSceneToEntity(ent.id, position);
      return ret?.data ?? position;
    } catch {
      return position;
    }
  }
};

// src/reality/hooks/useEntityEvent.tsx
function createEventProxy2(ev, instance) {
  return new Proxy(ev, {
    get(target, prop) {
      if (prop === "currentTarget") {
        return instance;
      }
      if (prop === "target") {
        const origin = target.__origin;
        if (origin) {
          return new EntityRef(origin, null);
        }
        return instance;
      }
      if (prop === "bubbles") {
        return true;
      }
      if (prop === "offsetX") {
        const type = target.type;
        if (type === "spatialtap") {
          return target.detail?.location3D?.x ?? 0;
        }
        if (type === "spatialdragstart") {
          return target.detail?.startLocation3D?.x ?? 0;
        }
        return void 0;
      }
      if (prop === "offsetY") {
        const type = target.type;
        if (type === "spatialtap") {
          return target.detail?.location3D?.y ?? 0;
        }
        if (type === "spatialdragstart") {
          return target.detail?.startLocation3D?.y ?? 0;
        }
        return void 0;
      }
      if (prop === "offsetZ") {
        const type = target.type;
        if (type === "spatialtap") {
          return target.detail?.location3D?.z ?? 0;
        }
        if (type === "spatialdragstart") {
          return target.detail?.startLocation3D?.z ?? 0;
        }
        return void 0;
      }
      if (prop === "translationX") {
        const type = target.type;
        if (type === "spatialdrag") {
          return target.detail?.translation3D?.x ?? 0;
        }
        return void 0;
      }
      if (prop === "translationY") {
        const type = target.type;
        if (type === "spatialdrag") {
          return target.detail?.translation3D?.y ?? 0;
        }
        return void 0;
      }
      if (prop === "translationZ") {
        const type = target.type;
        if (type === "spatialdrag") {
          return target.detail?.translation3D?.z ?? 0;
        }
        return void 0;
      }
      if (prop === "quaternion") {
        const type = target.type;
        if (type === "spatialrotate") {
          return target.detail?.quaternion ?? {
            x: 0,
            y: 0,
            z: 0,
            w: 1
          };
        }
        return void 0;
      }
      if (prop === "magnification") {
        const type = target.type;
        if (type === "spatialmagnify") {
          return target.detail?.magnification ?? 1;
        }
        return void 0;
      }
      if (prop === "clientX") {
        const type = target.type;
        if (type === "spatialtap" || type === "spatialdragstart") {
          return target.detail?.globalLocation3D?.x ?? 0;
        }
        return void 0;
      }
      if (prop === "clientY") {
        const type = target.type;
        if (type === "spatialtap" || type === "spatialdragstart") {
          return target.detail?.globalLocation3D?.y ?? 0;
        }
        return void 0;
      }
      if (prop === "clientZ") {
        const type = target.type;
        if (type === "spatialtap" || type === "spatialdragstart") {
          return target.detail?.globalLocation3D?.z ?? 0;
        }
        return void 0;
      }
      const val = target[prop];
      return typeof val === "function" ? val.bind(target) : val;
    }
  });
}
var useEntityEvent = ({ instance, ...handlers }) => {
  const eventsSetRef = useRef8(/* @__PURE__ */ new Set());
  useEffect18(() => {
    const entity = instance.entity;
    if (!entity) return;
    Object.entries(eventMap).forEach(([reactKey, spatialEvent]) => {
      const handlerFn = handlers[reactKey];
      if (!handlerFn) return;
      const wrapped = (ev) => handlerFn(createEventProxy2(ev, instance));
      entity.addEvent(spatialEvent, wrapped);
      eventsSetRef.current.add(reactKey);
    });
    return () => {
    };
  }, [instance.entity, ...Object.values(handlers)]);
  useEffect18(() => {
    const entity = instance.entity;
    if (!entity) return;
    return () => {
      for (let x of eventsSetRef.current) {
        entity.removeEvent(x);
      }
      eventsSetRef.current.clear();
    };
  }, [instance.entity]);
  return null;
};

// src/reality/hooks/useEntityId.tsx
import { useEffect as useEffect19 } from "react";
var useEntityId = ({ id, entity }) => {
  const ctx = useRealityContext();
  useEffect19(() => {
    if (!id || !entity || !ctx) return;
    ctx.resourceRegistry.add(id, Promise.resolve(entity));
    return () => {
      ctx.resourceRegistry.remove(id);
    };
  }, [id, entity, ctx]);
  return null;
};

// src/reality/hooks/useEntity.tsx
import { useEffect as useEffect20, useRef as useRef9 } from "react";
var useEntity = ({
  ref,
  id,
  position,
  rotation,
  scale,
  onSpatialTap,
  onSpatialDragStart,
  onSpatialDrag,
  onSpatialDragEnd,
  // onSpatialRotateStart,
  onSpatialRotate,
  onSpatialRotateEnd,
  // onSpatialMagnifyStart,
  onSpatialMagnify,
  onSpatialMagnifyEnd,
  // TODO: add other event handlers
  createEntity
}) => {
  const ctx = useRealityContext();
  const parent = useParentContext();
  const instanceRef = useRef9(new EntityRef(null, ctx));
  const forceUpdate = useForceUpdate2();
  useEffect20(() => {
    if (!ctx) return;
    const controller = new AbortController();
    const init = async () => {
      try {
        const ent = await createEntity(controller.signal);
        if (!ent) return;
        if (controller.signal.aborted) {
          ent.destroy();
          return;
        }
        if (parent) {
          const result = await parent.addEntity(ent);
          if (!result.success) throw new Error("parent.addEntity failed");
        } else {
          const result = await ctx.reality.addEntity(ent);
          if (!result.success) throw new Error("ctx.reality.addEntity failed");
        }
        instanceRef.current?.updateEntity(ent);
        forceUpdate();
      } catch (error) {
        console.error("useEntity init ~ error:", error);
      }
    };
    init();
    return () => {
      controller.abort();
      instanceRef.current?.destroy();
    };
  }, [ctx, parent]);
  useEntityId({ id, entity: instanceRef.current.entity });
  useEntityTransform(instanceRef.current.entity, { position, rotation, scale });
  useEntityRef(ref, instanceRef.current);
  useEntityEvent({
    instance: instanceRef.current,
    onSpatialTap,
    onSpatialDragStart,
    onSpatialDrag,
    onSpatialDragEnd,
    // onSpatialRotateStart,
    onSpatialRotate,
    onSpatialRotateEnd,
    // onSpatialMagnifyStart,
    onSpatialMagnify,
    onSpatialMagnifyEnd
  });
  return instanceRef.current.entity;
};

// src/reality/hooks/useForceUpdate.tsx
import { useCallback as useCallback7, useState as useState7 } from "react";
var useForceUpdate2 = () => {
  const [, setTick] = useState7(0);
  return useCallback7(() => setTick((tick) => tick + 1), []);
};

// src/reality/components/BaseEntity.tsx
import { jsx as jsx12 } from "react/jsx-runtime";
var BaseEntity = forwardRef10(
  ({ children, createEntity, ...rest }, ref) => {
    const ctx = useRealityContext();
    const entity = useEntity({
      ...rest,
      ref,
      createEntity: (signal) => createEntity(ctx, signal)
    });
    if (!entity) return null;
    return /* @__PURE__ */ jsx12(ParentContext.Provider, { value: entity, children });
  }
);

// src/reality/components/Entity.tsx
import { jsx as jsx13 } from "react/jsx-runtime";
var Entity = forwardRef11((props, ref) => {
  const { id, name, children, ...rest } = props;
  return /* @__PURE__ */ jsx13(
    BaseEntity,
    {
      ...rest,
      id,
      ref,
      createEntity: async (ctxVal) => ctxVal.session.createEntity({ id, name }),
      children
    }
  );
});

// src/reality/components/BoxEntity.tsx
import { forwardRef as forwardRef13 } from "react";

// src/reality/components/GeometryEntity.tsx
import { forwardRef as forwardRef12 } from "react";
import { jsx as jsx14 } from "react/jsx-runtime";
var GeometryEntity = forwardRef12(
  ({ id, children, name, materials, geometryOptions, createGeometry, ...rest }, ref) => {
    return /* @__PURE__ */ jsx14(
      BaseEntity,
      {
        ...rest,
        id,
        ref,
        createEntity: async (ctx, signal) => {
          const manager = new AbortResourceManager(signal);
          try {
            const ent = await manager.addResource(
              () => ctx.session.createEntity({ id, name })
            );
            const geometry = await manager.addResource(
              () => createGeometry(geometryOptions)
            );
            const materialList = await Promise.all(
              materials?.map((id2) => ctx.resourceRegistry.get(id2)).filter(Boolean) ?? []
            );
            const modelComponent = await manager.addResource(
              () => ctx.session.createModelComponent({
                mesh: geometry,
                materials: materialList
              })
            );
            await ent.addComponent(modelComponent);
            return ent;
          } catch (error) {
            await manager.dispose();
            return null;
          }
        },
        children
      }
    );
  }
);

// src/reality/components/BoxEntity.tsx
import { jsx as jsx15 } from "react/jsx-runtime";
var BoxEntity = forwardRef13(
  ({ children, ...props }, ref) => {
    const ctx = useRealityContext();
    return /* @__PURE__ */ jsx15(
      GeometryEntity,
      {
        ...props,
        ref,
        createGeometry: (options) => ctx.session.createBoxGeometry(options),
        geometryOptions: {
          width: props.width,
          height: props.height,
          depth: props.depth,
          cornerRadius: props.cornerRadius,
          splitFaces: props.splitFaces
        },
        children
      }
    );
  }
);

// src/reality/components/UnlitMaterial.tsx
import { useEffect as useEffect21, useRef as useRef10 } from "react";
var UnlitMaterial = ({ children, ...options }) => {
  const ctx = useRealityContext();
  const materialRef = useRef10();
  useEffect21(() => {
    if (!ctx) return;
    const { session, reality, resourceRegistry } = ctx;
    const init = async () => {
      const materialPromise = session.createUnlitMaterial(options);
      resourceRegistry.add(options.id, materialPromise);
      try {
        const mat = await materialPromise;
        materialRef.current = mat;
      } catch (error) {
        console.error(" ~ UnlitMaterial ~ error:", error);
      }
    };
    init();
    return () => {
      resourceRegistry.removeAndDestroy(options.id);
    };
  }, [ctx]);
  return null;
};

// src/reality/components/SphereEntity.tsx
import { forwardRef as forwardRef14 } from "react";
import { jsx as jsx16 } from "react/jsx-runtime";
var SphereEntity = forwardRef14(
  ({ children, ...props }, ref) => {
    const ctx = useRealityContext();
    return /* @__PURE__ */ jsx16(
      GeometryEntity,
      {
        ...props,
        ref,
        createGeometry: (options) => ctx.session.createSphereGeometry(options),
        geometryOptions: {
          radius: props.radius
        },
        children
      }
    );
  }
);

// src/reality/components/ConeEntity.tsx
import { forwardRef as forwardRef15 } from "react";
import { jsx as jsx17 } from "react/jsx-runtime";
var ConeEntity = forwardRef15(
  ({ children, ...props }, ref) => {
    const ctx = useRealityContext();
    return /* @__PURE__ */ jsx17(
      GeometryEntity,
      {
        ...props,
        ref,
        createGeometry: (options) => ctx.session.createConeGeometry(options),
        geometryOptions: {
          radius: props.radius,
          height: props.height
        },
        children
      }
    );
  }
);

// src/reality/components/CylinderEntity.tsx
import { forwardRef as forwardRef16 } from "react";
import { jsx as jsx18 } from "react/jsx-runtime";
var CylinderEntity = forwardRef16(
  ({ children, ...props }, ref) => {
    const ctx = useRealityContext();
    return /* @__PURE__ */ jsx18(
      GeometryEntity,
      {
        ...props,
        ref,
        createGeometry: (options) => ctx.session.createCylinderGeometry(options),
        geometryOptions: {
          radius: props.radius,
          height: props.height
        },
        children
      }
    );
  }
);

// src/reality/components/PlaneEntity.tsx
import { forwardRef as forwardRef17 } from "react";
import { jsx as jsx19 } from "react/jsx-runtime";
var PlaneEntity = forwardRef17(
  ({ children, ...props }, ref) => {
    const ctx = useRealityContext();
    return /* @__PURE__ */ jsx19(
      GeometryEntity,
      {
        ...props,
        ref,
        createGeometry: (options) => ctx.session.createPlaneGeometry(options),
        geometryOptions: {
          width: props.width,
          height: props.height,
          cornerRadius: props.cornerRadius
        },
        children
      }
    );
  }
);

// src/reality/components/SceneGraph.tsx
import { jsx as jsx20 } from "react/jsx-runtime";
var SceneGraph = ({ children }) => {
  return /* @__PURE__ */ jsx20(ParentContext.Provider, { value: null, children });
};

// src/reality/components/ModelAsset.tsx
import { useEffect as useEffect22, useRef as useRef11 } from "react";
var resolveAssetUrl = (url) => {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return new URL(url, window.location.href).href;
};
var ModelAsset = ({ children, ...options }) => {
  const ctx = useRealityContext();
  const materialRef = useRef11();
  useEffect22(() => {
    const controller = new AbortController();
    if (!ctx) return;
    const { session, reality, resourceRegistry } = ctx;
    const init = async () => {
      try {
        const resolvedUrl = resolveAssetUrl(options.src);
        const modelAssetPromise = session.createModelAsset({ url: resolvedUrl });
        resourceRegistry.add(options.id, modelAssetPromise);
        const mat = await modelAssetPromise;
        if (controller.signal.aborted) {
          mat.destroy();
          return;
        }
        materialRef.current = mat;
        options.onLoad?.();
      } catch (error) {
        options.onError?.(error);
      }
    };
    init();
    return () => {
      controller.abort();
      materialRef.current?.destroy();
    };
  }, [ctx]);
  return null;
};

// src/reality/components/ModelEntity.tsx
import { forwardRef as forwardRef18 } from "react";
import { jsx as jsx21 } from "react/jsx-runtime";
var ModelEntity = forwardRef18(
  ({ id, model, children, name, ...rest }, ref) => {
    return /* @__PURE__ */ jsx21(
      BaseEntity,
      {
        ...rest,
        id,
        ref,
        createEntity: async (ctx, signal) => {
          try {
            const modelAsset = await ctx.resourceRegistry.get(model);
            if (!modelAsset)
              throw new Error(`ModelEntity: model not found ${model}`);
            if (signal.aborted) return null;
            return ctx.session.createSpatialModelEntity(
              {
                modelAssetId: modelAsset.id,
                name
              },
              { id, name }
            );
          } catch (error) {
            return null;
          }
        },
        children
      }
    );
  }
);

// src/reality/components/Reality.tsx
import {
  forwardRef as forwardRef19,
  useCallback as useCallback8,
  useEffect as useEffect23,
  useRef as useRef12,
  useState as useState8
} from "react";
import { Fragment as Fragment3, jsx as jsx22, jsxs as jsxs3 } from "react/jsx-runtime";
var Reality = forwardRef19(
  function RealityBase({ children, ...inProps }, ref) {
    const insideAttachment = useInsideAttachment();
    if (insideAttachment) {
      console.warn(
        "[WebSpatial] Reality cannot be used inside AttachmentAsset."
      );
      return null;
    }
    const {
      onSpatialTap,
      onSpatialDragStart,
      onSpatialDrag,
      onSpatialDragEnd,
      onSpatialRotate,
      onSpatialRotateEnd,
      onSpatialMagnify,
      onSpatialMagnifyEnd,
      ...props
    } = inProps;
    const ctxRef = useRef12(null);
    const creationId = useRef12(0);
    const [isReady, setIsReady] = useState8(false);
    const cleanupReality = useCallback8(() => {
      ctxRef.current?.attachmentRegistry.destroy();
      ctxRef.current?.resourceRegistry.destroy();
      ctxRef.current?.reality.destroy();
      ctxRef.current = null;
      setIsReady(false);
    }, []);
    useEffect23(() => {
      return () => {
        creationId.current++;
        cleanupReality();
      };
    }, [cleanupReality]);
    const createReality = useCallback8(async () => {
      const id = ++creationId.current;
      const resourceRegistry = new ResourceRegistry();
      const attachmentRegistry = new AttachmentRegistry();
      const session = await getSession();
      if (!session) {
        resourceRegistry.destroy();
        attachmentRegistry.destroy();
        return null;
      }
      const reality = await session.createSpatializedDynamic3DElement();
      const isCancelled = () => id !== creationId.current;
      if (isCancelled()) {
        resourceRegistry.destroy();
        attachmentRegistry.destroy();
        reality.destroy();
        return null;
      }
      try {
        const result = await session.getSpatialScene().addSpatializedElement(reality);
        if (!result.success || isCancelled()) {
          resourceRegistry.destroy();
          attachmentRegistry.destroy();
          reality.destroy();
          return null;
        }
        cleanupReality();
        ctxRef.current = {
          session,
          reality,
          resourceRegistry,
          attachmentRegistry
        };
        setIsReady(true);
        return reality;
      } catch (err) {
        console.error("[createReality] failed", err);
        resourceRegistry.destroy();
        attachmentRegistry.destroy();
        reality.destroy();
        return null;
      }
    }, [cleanupReality]);
    const content = useCallback8(() => /* @__PURE__ */ jsx22(Fragment3, {}), []);
    return /* @__PURE__ */ jsxs3(RealityContext.Provider, { value: ctxRef.current, children: [
      /* @__PURE__ */ jsx22(
        SpatializedContainer,
        {
          component: "div",
          ref,
          createSpatializedElement: createReality,
          spatializedContent: content,
          ...props
        }
      ),
      isReady && children
    ] });
  }
);

// src/reality/components/AttachmentAsset.tsx
import { useEffect as useEffect24, useState as useState9 } from "react";
import { createPortal as createPortal3 } from "react-dom";
import { jsx as jsx23 } from "react/jsx-runtime";
var AttachmentAsset = ({
  name,
  children
}) => {
  const ctx = useRealityContext();
  const [containers, setContainers] = useState9([]);
  useEffect24(() => {
    if (!ctx) return;
    return ctx.attachmentRegistry.onContainersChange(name, setContainers);
  }, [ctx, name]);
  if (!containers.length) return null;
  return /* @__PURE__ */ jsx23(InsideAttachmentContext.Provider, { value: true, children: containers.map((c, idx) => createPortal3(children, c, `${name}-${idx}`)) });
};

// src/reality/components/AttachmentEntity.tsx
import { useEffect as useEffect25, useRef as useRef13, useState as useState10 } from "react";
var instanceCounter = 0;
var AttachmentEntity = ({
  attachment: attachmentName,
  position,
  size
}) => {
  const ctx = useRealityContext();
  const parent = useParentContext();
  const attachmentRef = useRef13(null);
  const parentIdRef = useRef13(null);
  const instanceIdRef = useRef13(`att_${++instanceCounter}`);
  const attachmentNameRef = useRef13(attachmentName);
  const [childWindow, setChildWindow] = useState10(null);
  useEffect25(() => {
    if (!ctx || !parent) return;
    const parentId = parent.id;
    parentIdRef.current = parentId;
    let cancelled = false;
    const init = async () => {
      try {
        const att = await ctx.session.createAttachmentEntity({
          parentEntityId: parentId,
          position: position ?? [0, 0, 0],
          size
        });
        if (cancelled) {
          att.destroy();
          return;
        }
        const windowProxy = att.getWindowProxy();
        setOpenWindowStyle(windowProxy);
        windowProxy.document.body.style.display = "block";
        windowProxy.document.body.style.minWidth = "100%";
        windowProxy.document.body.style.maxWidth = "100%";
        windowProxy.document.body.style.minHeight = "100%";
        await syncParentHeadToChild(windowProxy);
        const viewport = windowProxy.document.querySelector(
          'meta[name="viewport"]'
        );
        if (!viewport) {
          const meta = windowProxy.document.createElement("meta");
          meta.name = "viewport";
          meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
          windowProxy.document.head.appendChild(meta);
        }
        const base = windowProxy.document.createElement("base");
        base.href = document.baseURI;
        windowProxy.document.head.appendChild(base);
        attachmentRef.current = att;
        setChildWindow(windowProxy);
        ctx.attachmentRegistry.addContainer(
          attachmentNameRef.current,
          instanceIdRef.current,
          att.getContainer()
        );
      } catch (error) {
        console.error("[AttachmentEntity] init error:", error);
      }
    };
    init();
    return () => {
      cancelled = true;
      const att = attachmentRef.current;
      if (att) {
        ctx.attachmentRegistry.removeContainer(
          attachmentNameRef.current,
          instanceIdRef.current
        );
        att.destroy();
        attachmentRef.current = null;
        setChildWindow(null);
      }
    };
  }, [ctx, parent]);
  useEffect25(() => {
    if (!ctx) return;
    const att = attachmentRef.current;
    const prevName = attachmentNameRef.current;
    if (att && prevName !== attachmentName) {
      ctx.attachmentRegistry.removeContainer(prevName, instanceIdRef.current);
      ctx.attachmentRegistry.addContainer(
        attachmentName,
        instanceIdRef.current,
        att.getContainer()
      );
      attachmentNameRef.current = attachmentName;
    } else {
      attachmentNameRef.current = attachmentName;
    }
  }, [ctx, attachmentName]);
  useSyncHeadStyles(childWindow, { subtree: false });
  useEffect25(() => {
    if (!attachmentRef.current) return;
    attachmentRef.current.update({ position, size });
  }, [position?.[0], position?.[1], position?.[2], size?.width, size?.height]);
  return null;
};

// src/Model.tsx
import { forwardRef as forwardRef20 } from "react";
import { Spatial as Spatial2 } from "@webspatial/core-sdk";
import { jsx as jsx24 } from "react/jsx-runtime";
var spatial2 = new Spatial2();
function ModelBase(props, ref) {
  const insideAttachment = useInsideAttachment();
  const { "enable-xr": enableXR, ...restProps } = props;
  if (!enableXR || !spatial2.runInSpatialWeb() || insideAttachment) {
    const {
      onSpatialTap,
      onSpatialDragStart,
      onSpatialDrag,
      onSpatialDragEnd,
      onSpatialRotate,
      onSpatialRotateEnd,
      onSpatialMagnify,
      onSpatialMagnifyEnd,
      ...modelProps
    } = restProps;
    return /* @__PURE__ */ jsx24("model", { ref, ...modelProps });
  }
  return /* @__PURE__ */ jsx24(SpatializedStatic3DElementContainer, { ref, ...restProps });
}
var Model = withSSRSupported(forwardRef20(ModelBase));
Model.displayName = "Model";

// src/index.ts
var version = "1.2.1";
if (typeof window !== "undefined") {
  initPolyfill();
}
export {
  AttachmentAsset,
  AttachmentEntity,
  BoxEntity,
  ConeEntity,
  CylinderEntity,
  Entity,
  Model,
  ModelAsset,
  ModelEntity,
  PlaneEntity,
  Reality,
  SSRProvider,
  SceneGraph,
  SpatialMonitor,
  Spatialized2DElementContainer,
  SpatializedContainer,
  SpatializedStatic3DElementContainer,
  SphereEntity,
  UnlitMaterial,
  enableDebugTool,
  eventMap,
  initPolyfill,
  initScene,
  toLocalSpace,
  toSceneSpatial,
  version,
  withSpatialMonitor,
  withSpatialized2DElementContainer
};
//# sourceMappingURL=index.js.map