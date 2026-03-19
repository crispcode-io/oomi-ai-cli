
      (function(){
        if(typeof window === 'undefined') return;
        if(!window.__webspatialsdk__) window.__webspatialsdk__ = {}
        window.__webspatialsdk__['react-sdk-version'] = "1.2.1"
        window.__webspatialsdk__['XR_ENV'] = "avp"
    })()
      

// src/jsx/jsx-dev-runtime.ts
import { Fragment } from "react/jsx-runtime";

// src/jsx/jsx-shared.ts
import { jsxDEV as _jsxDEV } from "react/jsx-dev-runtime";
import reactJSXRuntime from "react/jsx-runtime";
import {
  withSpatialMonitor,
  withSpatialized2DElementContainer,
  Model
} from "@webspatial/react-sdk";
var attributeFlag = "enable-xr";
var styleFlag = "enableXr";
var classFlag = "__enableXr__";
var xrMonitorFlag = "enable-xr-monitor";
function replaceToSpatialPrimitiveType(type, props) {
  if (type === Model) {
    return type;
  }
  const propsObject = props;
  if (attributeFlag in propsObject) {
    delete propsObject[attributeFlag];
    return withSpatialized2DElementContainer(type);
  }
  if (xrMonitorFlag in propsObject) {
    delete propsObject[xrMonitorFlag];
    return withSpatialMonitor(type);
  }
  if (propsObject && propsObject.style && styleFlag in propsObject.style) {
    delete propsObject.style[styleFlag];
    return withSpatialized2DElementContainer(type);
  }
  if (propsObject && typeof propsObject.className === "string") {
    const originalClassNames = propsObject.className.split(" ");
    const idx = originalClassNames.indexOf(classFlag);
    if (idx !== -1) {
      originalClassNames.splice(idx, 1);
      propsObject.className = originalClassNames.join(" ");
      return withSpatialized2DElementContainer(type);
    }
  }
  return type;
}
function jsx(type, props, key) {
  type = replaceToSpatialPrimitiveType(type, props);
  return reactJSXRuntime.jsx(type, props, key);
}
function jsxDEV(type, props, key, isStatic, source, self) {
  type = replaceToSpatialPrimitiveType(type, props);
  return _jsxDEV(type, props, key, isStatic, source, self);
}
export {
  Fragment,
  jsx,
  jsxDEV
};
//# sourceMappingURL=jsx-dev-runtime.js.map