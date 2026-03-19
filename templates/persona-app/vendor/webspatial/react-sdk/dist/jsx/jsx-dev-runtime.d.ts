export { Fragment } from 'react/jsx-runtime';
import * as react from 'react';
import { JSXSource } from 'react/jsx-dev-runtime';
import { SpatialTapEvent, SpatialDragStartEvent, SpatialDragEvent, SpatialDragEndEvent, SpatialRotateStartEvent, SpatialRotateEvent, SpatialRotateEndEvent, SpatialMagnifyStartEvent, SpatialMagnifyEvent, SpatialMagnifyEndEvent } from '@webspatial/react-sdk';

declare function jsxs(type: React.ElementType, props: unknown, key?: React.Key): react.ReactElement<any, string | react.JSXElementConstructor<any>>;
declare function jsx(type: React.ElementType, props: unknown, key?: React.Key): react.ReactElement<any, string | react.JSXElementConstructor<any>>;
declare function jsxDEV(type: React.ElementType, props: unknown, key: React.Key, isStatic: boolean, source?: JSXSource, self?: unknown): react.ReactElement<any, string | react.JSXElementConstructor<any>>;

type IsPreReact19 = 2 extends Parameters<React.FunctionComponent<any>>['length'] ? true : false;
/** @ts-ignore */
type ReactJSXElement = true extends IsPreReact19 ? JSX.Element : React.JSX.Element;
/** @ts-ignore */
type ReactJSXElementClass = true extends IsPreReact19 ? JSX.ElementClass : React.JSX.ElementClass;
/** @ts-ignore */
type ReactJSXElementAttributesProperty = true extends IsPreReact19 ? JSX.ElementAttributesProperty : React.JSX.ElementAttributesProperty;
/** @ts-ignore */
type ReactJSXElementChildrenAttribute = true extends IsPreReact19 ? JSX.ElementChildrenAttribute : React.JSX.ElementChildrenAttribute;
/** @ts-ignore */
type ReactJSXLibraryManagedAttributes<C, P> = true extends IsPreReact19 ? JSX.LibraryManagedAttributes<C, P> : React.JSX.LibraryManagedAttributes<C, P>;
/** @ts-ignore */
type ReactJSXIntrinsicAttributes = true extends IsPreReact19 ? JSX.IntrinsicAttributes : React.JSX.IntrinsicAttributes;
/** @ts-ignore */
type ReactJSXIntrinsicClassAttributes<T> = true extends IsPreReact19 ? JSX.IntrinsicClassAttributes<T> : React.JSX.IntrinsicClassAttributes<T>;
/** @ts-ignore */
type ReactJSXIntrinsicElements = true extends IsPreReact19 ? JSX.IntrinsicElements : React.JSX.IntrinsicElements;
/** @ts-ignore */
type ReactJSXElementType = true extends IsPreReact19 ? string | React.JSXElementConstructor<any> : React.JSX.ElementType;
declare namespace WebSpatialJSX {
    type ElementType = ReactJSXElementType;
    interface Element extends ReactJSXElement {
    }
    interface ElementClass extends ReactJSXElementClass {
    }
    interface ElementAttributesProperty extends ReactJSXElementAttributesProperty {
    }
    interface ElementChildrenAttribute extends ReactJSXElementChildrenAttribute {
    }
    type LibraryManagedAttributes<C, P> = ReactJSXLibraryManagedAttributes<C, P>;
    interface IntrinsicAttributes extends ReactJSXIntrinsicAttributes {
    }
    interface IntrinsicClassAttributes<T> extends ReactJSXIntrinsicClassAttributes<T> {
    }
    type IntrinsicElements = {
        [K in keyof ReactJSXIntrinsicElements]: ReactJSXIntrinsicElements[K] & {
            style?: React.CSSProperties;
            'enable-xr'?: boolean;
            'enable-xr-monitor'?: boolean;
            onSpatialTap?: (e: SpatialTapEvent) => void;
            onSpatialDragStart?: (e: SpatialDragStartEvent) => void;
            onSpatialDrag?: (e: SpatialDragEvent) => void;
            onSpatialDragEnd?: (e: SpatialDragEndEvent) => void;
            onSpatialRotateStart?: (e: SpatialRotateStartEvent) => void;
            onSpatialRotate?: (e: SpatialRotateEvent) => void;
            onSpatialRotateEnd?: (e: SpatialRotateEndEvent) => void;
            onSpatialMagnifyStart?: (e: SpatialMagnifyStartEvent) => void;
            onSpatialMagnify?: (e: SpatialMagnifyEvent) => void;
            onSpatialMagnifyEnd?: (e: SpatialMagnifyEndEvent) => void;
        };
    };
}
declare module 'react' {
    interface CSSProperties {
        '--xr-background-material'?: string;
        '--xr-back'?: number | string;
        '--xr-depth'?: number | string;
        '--xr-z-index'?: number | string;
        enableXr?: boolean;
    }
}

declare global {
    interface CSSStyleDeclaration {
        '--xr-background-material'?: string;
        '--xr-back'?: number | string;
        '--xr-depth'?: number | string;
        '--xr-z-index'?: number | string;
        enableXr?: boolean;
    }
}

export { WebSpatialJSX as JSX, jsxs as j, jsx, jsxDEV };
