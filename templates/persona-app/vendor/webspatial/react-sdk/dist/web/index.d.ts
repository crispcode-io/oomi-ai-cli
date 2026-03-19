import * as _webspatial_core_sdk from '@webspatial/core-sdk';
import { SpatialSceneCreationOptions, SpatialSceneType, SpatialTapEvent as SpatialTapEvent$1, SpatialDragStartEvent as SpatialDragStartEvent$1, SpatialDragEvent as SpatialDragEvent$1, SpatialDragEndEvent as SpatialDragEndEvent$1, SpatialRotateEvent as SpatialRotateEvent$1, SpatialRotateEndEvent as SpatialRotateEndEvent$1, SpatialMagnifyEvent as SpatialMagnifyEvent$1, SpatialMagnifyEndEvent as SpatialMagnifyEndEvent$1, SpatializedElement, Point3D, SpatialObject, SpatialSession, SpatializedDynamic3DElement, Vec3, SpatialEntity, Quaternion, SpatialBoxGeometryOptions, SpatialUnlitMaterialOptions, SpatialSphereGeometryOptions, SpatialConeGeometryOptions, SpatialCylinderGeometryOptions, SpatialPlaneGeometryOptions } from '@webspatial/core-sdk';
export { Point3D, Vec3 } from '@webspatial/core-sdk';
import * as React$1 from 'react';
import React__default, { ElementType, ForwardedRef } from 'react';
import * as react_jsx_runtime from 'react/jsx-runtime';

declare function enableDebugTool(): void;

declare function initScene(name: string, callback: (pre: SpatialSceneCreationOptions) => SpatialSceneCreationOptions, options?: {
    type: SpatialSceneType;
}): void | undefined;

declare const SpatialID = "data-spatial-id";

type SpatialEventProps<T extends SpatializedElementRef> = {
    onSpatialTap?: (event: SpatialTapEvent<T>) => void;
    onSpatialDragStart?: (event: SpatialDragStartEvent<T>) => void;
    onSpatialDrag?: (event: SpatialDragEvent<T>) => void;
    onSpatialDragEnd?: (event: SpatialDragEndEvent<T>) => void;
    onSpatialRotate?: (event: SpatialRotateEvent<T>) => void;
    onSpatialRotateEnd?: (event: SpatialRotateEndEvent<T>) => void;
    onSpatialMagnify?: (event: SpatialMagnifyEvent<T>) => void;
    onSpatialMagnifyEnd?: (event: SpatialMagnifyEndEvent<T>) => void;
};
interface StandardSpatializedContainerProps extends React__default.ComponentPropsWithoutRef<'div'> {
    component: ElementType;
    inStandardSpatializedContainer?: boolean;
    [SpatialID]: string;
}
type RealityForbiddenSpatialEventProps = {
    onSpatialTap?: never;
    onSpatialDragStart?: never;
    onSpatialDrag?: never;
    onSpatialDragEnd?: never;
    onSpatialRotate?: never;
    onSpatialRotateEnd?: never;
    onSpatialMagnify?: never;
    onSpatialMagnifyEnd?: never;
};
type RealityProps = React__default.ComponentPropsWithRef<'div'> & RealityForbiddenSpatialEventProps;
type PortalSpatializedContainerProps<T extends SpatializedElementRef> = SpatialEventProps<T> & React__default.ComponentPropsWithoutRef<'div'> & {
    component: ElementType;
    spatializedContent: ElementType;
    createSpatializedElement: () => Promise<SpatializedElement>;
    getExtraSpatializedElementProperties?: (computedStyle: CSSStyleDeclaration) => Record<string, any>;
    [SpatialID]: string;
};
type SpatializedContainerProps<T extends SpatializedElementRef> = Omit<StandardSpatializedContainerProps & PortalSpatializedContainerProps<T>, typeof SpatialID | 'onLoad' | 'onError'> & {
    extraRefProps?: (domProxy: T) => Record<string, unknown>;
};
type Spatialized2DElementContainerProps<P extends ElementType> = SpatialEventProps<SpatializedElementRef> & React__default.ComponentPropsWithRef<'div'> & {
    component: P;
};
type SpatializedStatic3DContainerProps = SpatialEventProps<SpatializedStatic3DElementRef> & Omit<React__default.ComponentPropsWithoutRef<'div'>, 'onLoad' | 'onError'> & {
    src?: string;
    onLoad?: (event: ModelLoadEvent) => void;
    onError?: (event: ModelLoadEvent) => void;
};
type SpatializedElementRef<T extends HTMLElement = HTMLElement> = T;
type SpatializedDivElementRef = SpatializedElementRef<HTMLDivElement>;
type SpatializedStatic3DElementRef = SpatializedDivElementRef & {
    currentSrc: string;
    ready: Promise<ModelLoadEvent>;
    entityTransform: DOMMatrixReadOnly;
};
type CurrentTarget<T extends SpatializedElementRef> = {
    currentTarget: T;
};
type SpatialTapEvent<T extends SpatializedElementRef = SpatializedElementRef> = SpatialTapEvent$1 & CurrentTarget<T> & {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly offsetZ: number;
    readonly clientX: number;
    readonly clientY: number;
    readonly clientZ: number;
};
type SpatialDragStartEvent<T extends SpatializedElementRef = SpatializedElementRef> = SpatialDragStartEvent$1 & CurrentTarget<T> & {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly offsetZ: number;
    readonly clientX: number;
    readonly clientY: number;
    readonly clientZ: number;
};
type SpatialDragEvent<T extends SpatializedElementRef = SpatializedElementRef> = SpatialDragEvent$1 & CurrentTarget<T> & {
    readonly translationX: number;
    readonly translationY: number;
    readonly translationZ: number;
};
type SpatialDragEndEvent<T extends SpatializedElementRef = SpatializedElementRef> = SpatialDragEndEvent$1 & CurrentTarget<T>;
type SpatialRotateEvent<T extends SpatializedElementRef = SpatializedElementRef> = SpatialRotateEvent$1 & CurrentTarget<T> & {
    readonly quaternion: _webspatial_core_sdk.Quaternion;
};
type SpatialRotateEndEvent<T extends SpatializedElementRef = SpatializedElementRef> = SpatialRotateEndEvent$1 & CurrentTarget<T>;
type SpatialMagnifyEvent<T extends SpatializedElementRef = SpatializedElementRef> = SpatialMagnifyEvent$1 & CurrentTarget<T> & {
    readonly magnification: number;
};
type SpatialMagnifyEndEvent<T extends SpatializedElementRef = SpatializedElementRef> = SpatialMagnifyEndEvent$1 & CurrentTarget<T>;
type ModelSpatialTapEvent = SpatialTapEvent<SpatializedStatic3DElementRef>;
type ModelSpatialDragStartEvent = SpatialDragStartEvent<SpatializedStatic3DElementRef>;
type ModelSpatialDragEvent = SpatialDragEvent<SpatializedStatic3DElementRef>;
type ModelSpatialDragEndEvent = SpatialDragEndEvent<SpatializedStatic3DElementRef>;
type ModelSpatialRotateEvent = SpatialRotateEvent<SpatializedStatic3DElementRef>;
type ModelSpatialRotateEndEvent = SpatialRotateEndEvent<SpatializedStatic3DElementRef>;
type ModelSpatialMagnifyEvent = SpatialMagnifyEvent<SpatializedStatic3DElementRef>;
type ModelSpatialMagnifyEndEvent = SpatialMagnifyEndEvent<SpatializedStatic3DElementRef>;
type ModelLoadEvent = CustomEvent & {
    target: SpatializedStatic3DElementRef;
};

declare const SpatializedContainer: <T extends SpatializedElementRef>(props: SpatializedContainerProps<T> & {
    ref?: ForwardedRef<SpatializedElementRef<T>>;
}) => React.ReactElement | null;

declare const Spatialized2DElementContainer: <P extends ElementType>(props: Spatialized2DElementContainerProps<P> & {
    ref: ForwardedRef<SpatializedElementRef>;
}) => React__default.ReactElement | null;

declare const SpatializedStatic3DElementContainer: React$1.ForwardRefExoticComponent<{
    onSpatialTap?: ((event: SpatialTapEvent<SpatializedStatic3DElementRef>) => void) | undefined;
    onSpatialDragStart?: ((event: SpatialDragStartEvent<SpatializedStatic3DElementRef>) => void) | undefined;
    onSpatialDrag?: ((event: SpatialDragEvent<SpatializedStatic3DElementRef>) => void) | undefined;
    onSpatialDragEnd?: ((event: SpatialDragEndEvent<SpatializedStatic3DElementRef>) => void) | undefined;
    onSpatialRotate?: ((event: SpatialRotateEvent<SpatializedStatic3DElementRef>) => void) | undefined;
    onSpatialRotateEnd?: ((event: SpatialRotateEndEvent<SpatializedStatic3DElementRef>) => void) | undefined;
    onSpatialMagnify?: ((event: SpatialMagnifyEvent<SpatializedStatic3DElementRef>) => void) | undefined;
    onSpatialMagnifyEnd?: ((event: SpatialMagnifyEndEvent<SpatializedStatic3DElementRef>) => void) | undefined;
} & Omit<Omit<React$1.DetailedHTMLProps<React$1.HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "ref">, "onLoad" | "onError"> & {
    src?: string;
    onLoad?: (event: ModelLoadEvent) => void;
    onError?: (event: ModelLoadEvent) => void;
} & React$1.RefAttributes<SpatializedStatic3DElementRef>>;

declare function withSpatialized2DElementContainer<P extends ElementType>(Component: P): P | React$1.ForwardRefExoticComponent<Omit<Spatialized2DElementContainerProps<P>, "ref"> & React$1.RefAttributes<HTMLElement>>;

declare function toSceneSpatial(point: Point3D, spatializedElement: SpatializedElementRef): DOMPoint;
declare function toLocalSpace(point: Point3D, spatializedElement: SpatializedElementRef): DOMPoint;

declare function initPolyfill(): void;

declare function withSpatialMonitor(El: React__default.ElementType): any;

type SpatialMonitorProps = {
    El?: ElementType;
};
declare const SpatialMonitor: React$1.ForwardRefExoticComponent<SpatialMonitorProps & React$1.RefAttributes<HTMLElement>>;

declare class ResourceRegistry {
    private resources;
    add<T extends SpatialObject>(id: string, resource: Promise<T>): void;
    remove(id: string): void;
    removeAndDestroy(id: string): void;
    get<T extends SpatialObject>(id: string): Promise<T>;
    destroy(): void;
}

type ContainersChangeCallback = (containers: HTMLElement[]) => void;
declare class AttachmentRegistry {
    private containers;
    private listeners;
    addContainer(name: string, instanceId: string, container: HTMLElement): void;
    removeContainer(name: string, instanceId: string): void;
    getContainers(name: string): HTMLElement[];
    onContainersChange(name: string, cb: ContainersChangeCallback): () => void;
    private notifyListeners;
    destroy(): void;
}

type RealityContextValue = {
    session: SpatialSession;
    reality: SpatializedDynamic3DElement;
    resourceRegistry: ResourceRegistry;
    attachmentRegistry: AttachmentRegistry;
} | null;

interface EntityRefShape {
    convertFromEntityToEntity: (fromEntityId: string, toEntityId: string, position: Vec3) => Promise<Vec3>;
    convertFromEntityToReality: (entityId: string, position: Vec3) => Promise<Vec3>;
    convertFromRealityToEntity: (entityId: string, position: Vec3) => Promise<Vec3>;
    id: string | undefined;
    name: string | undefined;
    entity: SpatialEntity | null;
}
declare class EntityRef implements EntityRefShape {
    private _entity;
    private _ctx;
    constructor(entity?: SpatialEntity | null, ctx?: RealityContextValue | null);
    updateEntity(entity?: SpatialEntity | null): void;
    updateCtx(ctx?: RealityContextValue | null): void;
    destroy(): void;
    get entity(): SpatialEntity | null;
    get id(): string | undefined;
    get name(): string | undefined;
    convertFromEntityToEntity(fromEntityId: string, toEntityId: string, position: Vec3): Promise<Vec3>;
    convertFromEntityToReality(entityId: string, position: Vec3): Promise<Vec3>;
    convertFromRealityToEntity(entityId: string, position: Vec3): Promise<Vec3>;
}

type EntityProps = {
    id?: string;
    name?: string;
    position?: Vec3;
    rotation?: Vec3;
    scale?: Vec3;
};
type allTarget<T extends EntityRefShape> = {
    target: T;
    currentTarget: T;
};
type SpatialTapEntityEvent<T extends EntityRefShape = EntityRefShape> = SpatialTapEvent$1 & allTarget<T> & {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly offsetZ: number;
    readonly clientX: number;
    readonly clientY: number;
    readonly clientZ: number;
};
type SpatialDragStartEntityEvent<T extends EntityRefShape = EntityRefShape> = SpatialDragStartEvent$1 & allTarget<T> & {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly offsetZ: number;
    readonly clientX: number;
    readonly clientY: number;
    readonly clientZ: number;
};
type SpatialDragEntityEvent<T extends EntityRefShape = EntityRefShape> = SpatialDragEvent$1 & allTarget<T> & {
    readonly translationX: number;
    readonly translationY: number;
    readonly translationZ: number;
};
type SpatialDragEndEntityEvent<T extends EntityRefShape = EntityRefShape> = SpatialDragEndEvent$1 & allTarget<T>;
type SpatialRotateEntityEvent<T extends EntityRefShape = EntityRefShape> = SpatialRotateEvent$1 & allTarget<T> & {
    readonly quaternion: Quaternion;
};
type SpatialRotateEndEntityEvent<T extends EntityRefShape = EntityRefShape> = SpatialRotateEndEvent$1 & allTarget<T>;
type SpatialMagnifyEntityEvent<T extends EntityRefShape = EntityRefShape> = SpatialMagnifyEvent$1 & allTarget<T> & {
    readonly magnification: number;
};
type SpatialMagnifyEndEntityEvent<T extends EntityRefShape = EntityRefShape> = SpatialMagnifyEndEvent$1 & allTarget<T>;
type EntityEventHandler = {
    onSpatialTap?: (event: SpatialTapEntityEvent) => void;
    onSpatialDragStart?: (event: SpatialDragStartEntityEvent) => void;
    onSpatialDrag?: (event: SpatialDragEntityEvent) => void;
    onSpatialDragEnd?: (event: SpatialDragEndEntityEvent) => void;
    onSpatialRotate?: (event: SpatialRotateEntityEvent) => void;
    onSpatialRotateEnd?: (event: SpatialRotateEndEntityEvent) => void;
    onSpatialMagnify?: (event: SpatialMagnifyEntityEvent) => void;
    onSpatialMagnifyEnd?: (event: SpatialMagnifyEndEntityEvent) => void;
};
declare const eventMap: {
    readonly onSpatialTap: "spatialtap";
    readonly onSpatialDragStart: "spatialdragstart";
    readonly onSpatialDrag: "spatialdrag";
    readonly onSpatialDragEnd: "spatialdragend";
    readonly onSpatialRotateStart: "spatialrotatestart";
    readonly onSpatialRotate: "spatialrotate";
    readonly onSpatialRotateEnd: "spatialrotateend";
    readonly onSpatialMagnifyStart: "spatialmagnifystart";
    readonly onSpatialMagnify: "spatialmagnify";
    readonly onSpatialMagnifyEnd: "spatialmagnifyend";
};

declare const Entity: React__default.ForwardRefExoticComponent<EntityProps & EntityEventHandler & {
    children?: React__default.ReactNode;
} & React__default.RefAttributes<EntityRefShape>>;

declare const BoxEntity: React__default.ForwardRefExoticComponent<EntityProps & EntityEventHandler & {
    children?: React__default.ReactNode;
    materials?: string[];
} & SpatialBoxGeometryOptions & React__default.RefAttributes<EntityRefShape>>;

type Props$2 = {
    children?: React__default.ReactNode;
    id: string;
} & SpatialUnlitMaterialOptions;
declare const UnlitMaterial: React__default.FC<Props$2>;

declare const SphereEntity: React__default.ForwardRefExoticComponent<EntityProps & EntityEventHandler & {
    children?: React__default.ReactNode;
    materials?: string[];
} & SpatialSphereGeometryOptions & React__default.RefAttributes<EntityRefShape>>;

declare const ConeEntity: React__default.ForwardRefExoticComponent<EntityProps & EntityEventHandler & {
    children?: React__default.ReactNode;
    materials?: string[];
} & SpatialConeGeometryOptions & React__default.RefAttributes<EntityRefShape>>;

declare const CylinderEntity: React__default.ForwardRefExoticComponent<EntityProps & EntityEventHandler & {
    children?: React__default.ReactNode;
    materials?: string[];
} & SpatialCylinderGeometryOptions & React__default.RefAttributes<EntityRefShape>>;

declare const PlaneEntity: React__default.ForwardRefExoticComponent<EntityProps & EntityEventHandler & {
    children?: React__default.ReactNode;
    materials?: string[];
} & SpatialPlaneGeometryOptions & React__default.RefAttributes<EntityRefShape>>;

type Props$1 = {
    children?: React__default.ReactNode;
};
declare const SceneGraph: React__default.FC<Props$1>;

type Props = {
    children?: React__default.ReactNode;
    id: string;
    src: string;
    onLoad?: () => void;
    onError?: (error: any) => void;
};
declare const ModelAsset: React__default.FC<Props>;

declare const ModelEntity: React__default.ForwardRefExoticComponent<EntityProps & {
    model: string;
} & EntityEventHandler & {
    children?: React__default.ReactNode;
} & React__default.RefAttributes<EntityRefShape>>;

declare const Reality: React__default.ForwardRefExoticComponent<Omit<RealityProps, "ref"> & React__default.RefAttributes<HTMLElement>>;

type AttachmentAssetProps = {
    name: string;
    children?: React__default.ReactNode;
};
declare const AttachmentAsset: React__default.FC<AttachmentAssetProps>;

interface AttachmentEntityProps {
    attachment: string;
    position?: [number, number, number];
    size: {
        width: number;
        height: number;
    };
}
declare const AttachmentEntity: React__default.FC<AttachmentEntityProps>;

type ModelProps = SpatializedStatic3DContainerProps & {
    'enable-xr'?: boolean;
};
type ModelRef = SpatializedStatic3DElementRef;
declare const Model: React$1.ForwardRefExoticComponent<Omit<{
    onSpatialTap?: ((event: SpatialTapEvent<SpatializedStatic3DElementRef>) => void) | undefined;
    onSpatialDragStart?: ((event: SpatialDragStartEvent<SpatializedStatic3DElementRef>) => void) | undefined;
    onSpatialDrag?: ((event: SpatialDragEvent<SpatializedStatic3DElementRef>) => void) | undefined;
    onSpatialDragEnd?: ((event: SpatialDragEndEvent<SpatializedStatic3DElementRef>) => void) | undefined;
    onSpatialRotate?: ((event: SpatialRotateEvent<SpatializedStatic3DElementRef>) => void) | undefined;
    onSpatialRotateEnd?: ((event: SpatialRotateEndEvent<SpatializedStatic3DElementRef>) => void) | undefined;
    onSpatialMagnify?: ((event: SpatialMagnifyEvent<SpatializedStatic3DElementRef>) => void) | undefined;
    onSpatialMagnifyEnd?: ((event: SpatialMagnifyEndEvent<SpatializedStatic3DElementRef>) => void) | undefined;
} & Omit<Omit<React$1.DetailedHTMLProps<React$1.HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "ref">, "onLoad" | "onError"> & {
    src?: string;
    onLoad?: (event: ModelLoadEvent) => void;
    onError?: (event: ModelLoadEvent) => void;
} & {
    'enable-xr'?: boolean;
} & React$1.RefAttributes<SpatializedStatic3DElementRef>, "ref"> & React$1.RefAttributes<any>>;

declare const SSRProvider: ({ isSSR: initialIsSSR, children, }: {
    isSSR?: boolean;
    children: React__default.ReactNode;
}) => react_jsx_runtime.JSX.Element;

declare const version: string;

export { AttachmentAsset, AttachmentEntity, BoxEntity, ConeEntity, CylinderEntity, Entity, type EntityEventHandler, type EntityProps, EntityRef, Model, ModelAsset, ModelEntity, type ModelLoadEvent, type ModelProps, type ModelRef, type ModelSpatialDragEndEvent, type ModelSpatialDragEvent, type ModelSpatialDragStartEvent, type ModelSpatialMagnifyEndEvent, type ModelSpatialMagnifyEvent, type ModelSpatialRotateEndEvent, type ModelSpatialRotateEvent, type ModelSpatialTapEvent, PlaneEntity, Reality, SSRProvider, SceneGraph, type SpatialDragEndEntityEvent, type SpatialDragEndEvent, type SpatialDragEntityEvent, type SpatialDragEvent, type SpatialDragStartEntityEvent, type SpatialDragStartEvent, type SpatialMagnifyEndEntityEvent, type SpatialMagnifyEndEvent, type SpatialMagnifyEntityEvent, type SpatialMagnifyEvent, SpatialMonitor, type SpatialRotateEndEntityEvent, type SpatialRotateEndEvent, type SpatialRotateEntityEvent, type SpatialRotateEvent, type SpatialTapEntityEvent, type SpatialTapEvent, Spatialized2DElementContainer, type Spatialized2DElementContainerProps, SpatializedContainer, type SpatializedElementRef, type SpatializedStatic3DContainerProps, SpatializedStatic3DElementContainer, type SpatializedStatic3DElementRef, SphereEntity, UnlitMaterial, enableDebugTool, eventMap, initPolyfill, initScene, toLocalSpace, toSceneSpatial, version, withSpatialMonitor, withSpatialized2DElementContainer };
