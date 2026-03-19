/**
 * @hidden
 * Parent class of spatial objects, should not be used directly
 */
declare class SpatialObject {
    /** @hidden */
    readonly id: string;
    /** @hidden */
    constructor(
    /** @hidden */
    id: string);
    name?: string;
    isDestroyed: boolean;
    inspect(): Promise<any>;
    destroy(): Promise<any>;
    protected onDestroy(): void;
}

interface CommandResult {
    success: boolean;
    data: any;
    errorCode: string | undefined;
    errorMessage: string | undefined;
}
interface WebSpatialProtocolResult extends CommandResult {
    success: boolean;
    data: {
        windowProxy: WindowProxy;
        id: string;
    } | undefined;
    errorCode: string | undefined;
    errorMessage: string | undefined;
}

declare class SpatialGeometry extends SpatialObject {
    id: string;
    options: SpatialGeometryOptions;
    static type: SpatialGeometryType;
    constructor(id: string, options: SpatialGeometryOptions);
}

declare abstract class SpatialMaterial extends SpatialObject {
    id: string;
    type: SpatialMaterialType;
    constructor(id: string, type: SpatialMaterialType);
    abstract updateProperties(properties: any): void;
}

declare enum SpatialWebMsgType {
    cubeInfo = "cubeInfo",
    transform = "transform",
    modelloaded = "modelloaded",
    modelloadfailed = "modelloadfailed",
    spatialtap = "spatialtap",
    spatialdragstart = "spatialdragstart",
    spatialdrag = "spatialdrag",
    spatialdragend = "spatialdragend",
    spatialrotate = "spatialrotate",
    spatialrotateend = "spatialrotateend",
    spatialmagnify = "spatialmagnify",
    spatialmagnifyend = "spatialmagnifyend",
    objectdestroy = "objectdestroy"
}
interface ObjectDestroyMsg {
    type: SpatialWebMsgType.objectdestroy;
}
interface CubeInfoMsg {
    type: SpatialWebMsgType.cubeInfo;
    origin: Vec3;
    size: Size3D;
}
interface CubeInfoMsg {
    type: SpatialWebMsgType.cubeInfo;
    origin: Vec3;
    size: Size3D;
}
interface TransformMsg {
    type: SpatialWebMsgType.transform;
    detail: {
        column0: [number, number, number];
        column1: [number, number, number];
        column2: [number, number, number];
        column3: [number, number, number];
    };
}
interface SpatialTapMsg {
    type: SpatialWebMsgType.spatialtap;
    detail: SpatialTapEventDetail;
}
interface SpatialDragStartMsg {
    type: SpatialWebMsgType.spatialdragstart;
    detail: SpatialDragStartEventDetail;
}
interface SpatialDragMsg {
    type: SpatialWebMsgType.spatialdrag;
    detail: SpatialDragEventDetail;
}
interface SpatialDragEndMsg {
    type: SpatialWebMsgType.spatialdragend;
    detail: SpatialDragEndEventDetail;
}
interface SpatialRotateMsg {
    type: SpatialWebMsgType.spatialrotate;
    detail: SpatialRotateEventDetail;
}
interface SpatialRotateEndMsg {
    type: SpatialWebMsgType.spatialrotateend;
    detail: SpatialRotateEventDetail;
}

/**
 * Abstract base class for all spatialized elements in the WebSpatial environment.
 * Provides common functionality for elements that can exist in 3D space,
 * including transformation handling and gesture event processing.
 */
declare abstract class SpatializedElement extends SpatialObject {
    readonly id: string;
    /**
     * Creates a new spatialized element with the specified ID.
     * Registers the element to receive spatial events.
     * @param id Unique identifier for this element
     */
    constructor(id: string);
    /**
     * Updates the properties of this spatialized element.
     * Must be implemented by derived classes to handle specific property updates.
     * @param properties Partial set of properties to update
     * @returns Promise resolving to the result of the update operation
     */
    abstract updateProperties(properties: Partial<SpatializedElementProperties>): Promise<WebSpatialProtocolResult>;
    /**
     * Updates the transformation matrix of this element in 3D space.
     * This affects the position, rotation, and scale of the element.
     * @param matrix The new transformation matrix
     * @returns Promise resolving when the transform is updated
     */
    updateTransform(matrix: DOMMatrix): Promise<CommandResult>;
    /**
     * Information about the element's bounding cube.
     * Used for spatial calculations and hit testing.
     */
    private _cubeInfo?;
    /**
     * Gets the current cube information for this element.
     * @returns The current CubeInfo or undefined if not set
     */
    get cubeInfo(): CubeInfo$1 | undefined;
    /**
     * The current transformation matrix of this element.
     */
    private _transform?;
    /**
     * The inverse of the current transformation matrix.
     * Used for converting world coordinates to local coordinates.
     */
    private _transformInv?;
    /**
     * Gets the current transformation matrix.
     * @returns The current transformation matrix or undefined if not set
     */
    get transform(): DOMMatrix | undefined;
    /**
     * Gets the inverse of the current transformation matrix.
     * @returns The inverse transformation matrix or undefined if not set
     */
    get transformInv(): DOMMatrix | undefined;
    /**
     * Processes events received from the WebSpatial environment.
     * Handles various spatial events like transforms, gestures, and interactions.
     * @param data The event data received from the WebSpatial system
     */
    protected onReceiveEvent(data: CubeInfoMsg | TransformMsg | SpatialTapMsg | SpatialDragStartMsg | SpatialDragMsg | SpatialDragEndMsg | SpatialRotateMsg | SpatialRotateEndMsg | ObjectDestroyMsg): void;
    private _onSpatialTap?;
    set onSpatialTap(value: (event: SpatialTapEvent) => void | undefined);
    private _onSpatialDragStart?;
    set onSpatialDragStart(value: (event: SpatialDragStartEvent) => void | undefined);
    private _onSpatialDrag?;
    set onSpatialDrag(value: (event: SpatialDragEvent) => void | undefined);
    private _onSpatialDragEnd?;
    set onSpatialDragEnd(value: ((event: SpatialDragEndEvent) => void) | undefined);
    private _onSpatialRotate?;
    set onSpatialRotate(value: ((event: SpatialRotateEvent) => void) | undefined);
    private _onSpatialRotateEnd?;
    set onSpatialRotateEnd(value: ((event: SpatialRotateEndEvent) => void) | undefined);
    private _onSpatialMagnify?;
    set onSpatialMagnify(value: ((event: SpatialMagnifyEvent) => void) | undefined);
    private _onSpatialMagnifyEnd?;
    set onSpatialMagnifyEnd(value: ((event: SpatialMagnifyEndEvent) => void) | undefined);
    /**
     * Cleans up resources when this element is destroyed.
     * Removes event receivers to prevent memory leaks.
     */
    onDestroy(): void;
}

declare class SpatializedDynamic3DElement extends SpatializedElement {
    children: SpatialEntityOrReality[];
    constructor(id: string);
    addEntity(entity: SpatialEntity): Promise<CommandResult>;
    updateProperties(properties: Partial<SpatializedElementProperties>): Promise<CommandResult>;
}

interface Vec3 {
    x: number;
    y: number;
    z: number;
}
type Point3D = Vec3;
interface Quaternion {
    x: number;
    y: number;
    z: number;
    w: number;
}
/**
 * Material type for SpatialDiv or HTML document.
 *
 * This type defines the background material options for both SpatialDiv elements and HTML documents.
 *
 * - `'none'`: This is the default value.
 *   - For HTML documents, the web page window will have the default native background.
 *   - For SpatialDiv, the window will have a transparent background.
 * - `'translucent'`: Represents a glass-like material in AVP (Apple Vision Pro).
 * - `'thick'`: Represents a thick material in AVP.
 * - `'regular'`: Represents a regular material in AVP.
 * - `'thin'`: Represents a thin material in AVP.
 * - `'transparent'`: Represents a fully transparent background.
 */
type BackgroundMaterialType = 'none' | 'translucent' | 'thick' | 'regular' | 'thin' | 'transparent';
type CornerRadius = {
    topLeading: number;
    bottomLeading: number;
    topTrailing: number;
    bottomTrailing: number;
};
interface SpatialSceneProperties {
    cornerRadius: CornerRadius;
    material: BackgroundMaterialType;
    opacity: number;
}
declare enum SpatializedElementType {
    Spatialized2DElement = 0,
    SpatializedStatic3DElement = 1,
    SpatializedDynamic3DElement = 2
}
interface SpatializedElementProperties {
    name: string;
    clientX: number;
    clientY: number;
    width: number;
    height: number;
    depth: number;
    opacity: number;
    visible: boolean;
    scrollWithParent: boolean;
    zIndex: number;
    backOffset: number;
    rotationAnchor: Point3D;
    enableTapGesture: boolean;
    enableDragStartGesture: boolean;
    enableDragGesture: boolean;
    enableDragEndGesture: boolean;
    enableRotateGesture: boolean;
    enableRotateEndGesture: boolean;
    enableMagnifyGesture: boolean;
    enableMagnifyEndGesture: boolean;
    /**
     * Base64-encoded bitmap data for Android XR rendering.
     * On Android, since we can't create multiple WebViews like visionOS,
     * we capture HTML content as bitmaps and render them on SpatialPanels.
     */
    bitmap: string;
}
interface Spatialized2DElementProperties extends SpatializedElementProperties {
    scrollPageEnabled: boolean;
    cornerRadius: CornerRadius;
    material: BackgroundMaterialType;
    scrollEdgeInsetsMarginRight: number;
}
interface SpatializedStatic3DElementProperties extends SpatializedElementProperties {
    modelURL: string;
    modelTransform?: number[];
}
interface SpatialSceneCreationOptions$1 {
    defaultSize?: {
        width: number | string;
        height: number | string;
        depth?: number | string;
    };
    resizability?: {
        minWidth?: number | string;
        minHeight?: number | string;
        maxWidth?: number | string;
        maxHeight?: number | string;
    };
    worldScaling?: WorldScalingType;
    worldAlignment?: WorldAlignmentType;
    baseplateVisibility?: BaseplateVisibilityType;
}
declare const BaseplateVisibilityValues: readonly ["automatic", "visible", "hidden"];
type BaseplateVisibilityType = (typeof BaseplateVisibilityValues)[number];
declare function isValidBaseplateVisibilityType(type: string): Boolean;
declare const WorldScalingValues: readonly ["automatic", "dynamic"];
type WorldScalingType = (typeof WorldScalingValues)[number];
declare function isValidWorldScalingType(type: string): Boolean;
declare const WorldAlignmentValues: readonly ["adaptive", "automatic", "gravityAligned"];
type WorldAlignmentType = (typeof WorldAlignmentValues)[number];
declare function isValidWorldAlignmentType(type: string): Boolean;
declare const SpatialSceneValues: readonly ["window", "volume"];
type SpatialSceneType$1 = (typeof SpatialSceneValues)[number];
declare function isValidSpatialSceneType(type: string): Boolean;
/**
 * check px,m and number, number must be >= 0
 *
 * */
declare function isValidSceneUnit(val: string | number): boolean;
interface SpatialEntityProperties {
    position: Vec3;
    rotation: Vec3;
    scale: Vec3;
}
type SpatialEntityEventType = 'spatialtap';
type SpatialGeometryType = 'BoxGeometry' | 'PlaneGeometry' | 'SphereGeometry' | 'CylinderGeometry' | 'ConeGeometry';
interface SpatialBoxGeometryOptions {
    width?: number;
    height?: number;
    depth?: number;
    cornerRadius?: number;
    splitFaces?: boolean;
}
interface SpatialPlaneGeometryOptions {
    width?: number;
    height?: number;
    cornerRadius?: number;
}
interface SpatialSphereGeometryOptions {
    radius?: number;
}
interface SpatialConeGeometryOptions {
    radius?: number;
    height?: number;
}
interface SpatialCylinderGeometryOptions {
    radius?: number;
    height?: number;
}
type SpatialGeometryOptions = SpatialBoxGeometryOptions | SpatialPlaneGeometryOptions | SpatialSphereGeometryOptions | SpatialCylinderGeometryOptions | SpatialConeGeometryOptions;
type SpatialMaterialType = 'unlit';
interface SpatialUnlitMaterialOptions {
    color?: string;
    textureId?: string;
    transparent?: boolean;
    opacity?: number;
}
interface ModelComponentOptions {
    mesh: SpatialGeometry;
    materials: SpatialMaterial[];
}
interface SpatialEntityUserData {
    id?: string;
    name?: string;
}
interface SpatialModelEntityCreationOptions {
    modelAssetId: string;
    name?: string;
}
interface ModelAssetOptions {
    url: string;
}
declare enum SpatialSceneState$1 {
    idle = "idle",
    pending = "pending",
    willVisible = "willVisible",
    visible = "visible",
    fail = "fail"
}
/**
 * Translate event, matching similar behavior to https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/drag_event
 */
type SpatialModelDragEvent = {
    eventType: 'dragstart' | 'dragend' | 'drag';
    translation3D: Vec3;
    startLocation3D: Vec3;
};
interface Size {
    width: number;
    height: number;
}
interface Size3D extends Size {
    depth: number;
}
declare class CubeInfo$1 {
    size: Size3D;
    origin: Vec3;
    constructor(size: Size3D, origin: Vec3);
    get x(): number;
    get y(): number;
    get z(): number;
    get width(): number;
    get height(): number;
    get depth(): number;
    get left(): number;
    get top(): number;
    get right(): number;
    get bottom(): number;
    get back(): number;
    get front(): number;
}
interface SpatialTapEventDetail {
    location3D: Point3D;
    globalLocation3D?: Point3D;
}
type SpatialTapEvent = CustomEvent<SpatialTapEventDetail>;
interface SpatialDragStartEventDetail {
    startLocation3D: Point3D;
    globalLocation3D?: Point3D;
}
interface SpatialDragEventDetail {
    translation3D: Vec3;
}
interface SpatialDragEndEventDetail {
}
type SpatialDragStartEvent = CustomEvent<SpatialDragStartEventDetail>;
type SpatialDragEvent = CustomEvent<SpatialDragEventDetail>;
type SpatialDragEndEvent = CustomEvent<SpatialDragEndEventDetail>;
interface SpatialRotateEventDetail {
    quaternion: Quaternion;
}
interface SpatialRotateEndEventDetail {
}
type SpatialRotateEvent = CustomEvent<SpatialRotateEventDetail>;
type SpatialRotateEndEvent = CustomEvent<SpatialRotateEndEventDetail>;
interface SpatialMagnifyEventDetail {
    magnification: number;
}
interface SpatialMagnifyEndEventDetail {
}
type SpatialMagnifyEvent = CustomEvent<SpatialMagnifyEventDetail>;
type SpatialMagnifyEndEvent = CustomEvent<SpatialMagnifyEndEventDetail>;
type SpatialEntityOrReality = SpatialEntity | SpatializedDynamic3DElement;
interface AttachmentEntityOptions {
    parentEntityId: string;
    position?: [number, number, number];
    size: {
        width: number;
        height: number;
    };
}
interface AttachmentEntityUpdateOptions {
    position?: [number, number, number];
    size?: {
        width: number;
        height: number;
    };
}

declare class SpatialComponent extends SpatialObject {
    constructor(id: string);
    private onReceiveEvent;
}

declare class SpatialEntity extends SpatialObject {
    userData?: SpatialEntityUserData | undefined;
    position: Vec3;
    rotation: Vec3;
    scale: Vec3;
    events: Record<string, (data: any) => void>;
    children: SpatialEntity[];
    parent: SpatialEntityOrReality | null;
    constructor(id: string, userData?: SpatialEntityUserData | undefined);
    addComponent(component: SpatialComponent): Promise<CommandResult>;
    setPosition(position: Vec3): Promise<CommandResult>;
    setRotation(rotation: Vec3): Promise<CommandResult>;
    setScale(scale: Vec3): Promise<CommandResult>;
    addEntity(ent: SpatialEntity): Promise<CommandResult>;
    removeFromParent(): Promise<CommandResult>;
    updateTransform(properties: Partial<SpatialEntityProperties>): Promise<CommandResult>;
    addEvent(type: SpatialEntityEventType, callback: (data: any) => void): Promise<void>;
    removeEvent(eventName: SpatialEntityEventType): Promise<void>;
    updateEntityEvent(eventName: SpatialEntityEventType, isEnable: boolean): Promise<CommandResult>;
    private onReceiveEvent;
    dispatchEvent(evt: CustomEvent): void;
    protected onDestroy(): void;
    convertFromEntityToEntity(fromEntityId: string, toEntityId: string, position: Vec3): Promise<CommandResult>;
    convertFromEntityToScene(fromEntityId: string, position: Vec3): Promise<CommandResult>;
    convertFromSceneToEntity(entityId: string, position: Vec3): Promise<CommandResult>;
}

declare class SpatialModelEntity extends SpatialEntity {
    id: string;
    options?: SpatialModelEntityCreationOptions | undefined;
    userData?: SpatialEntityUserData | undefined;
    constructor(id: string, options?: SpatialModelEntityCreationOptions | undefined, userData?: SpatialEntityUserData | undefined);
}

declare class ModelComponent extends SpatialComponent {
    options: ModelComponentOptions;
    constructor(id: string, options: ModelComponentOptions);
}

declare class SpatialUnlitMaterial extends SpatialMaterial {
    id: string;
    options: SpatialUnlitMaterialOptions;
    constructor(id: string, options: SpatialUnlitMaterialOptions);
    updateProperties(properties: Partial<SpatialUnlitMaterialOptions>): Promise<CommandResult>;
}

declare class SpatialBoxGeometry extends SpatialGeometry {
    id: string;
    options: SpatialBoxGeometryOptions;
    static type: SpatialGeometryType;
    constructor(id: string, options: SpatialBoxGeometryOptions);
}

declare class SpatialSphereGeometry extends SpatialGeometry {
    id: string;
    options: SpatialSphereGeometryOptions;
    static type: SpatialGeometryType;
    constructor(id: string, options: SpatialSphereGeometryOptions);
}

declare class SpatialCylinderGeometry extends SpatialGeometry {
    id: string;
    options: SpatialCylinderGeometryOptions;
    static type: SpatialGeometryType;
    constructor(id: string, options: SpatialCylinderGeometryOptions);
}

declare class SpatialPlaneGeometry extends SpatialGeometry {
    id: string;
    options: SpatialPlaneGeometryOptions;
    static type: SpatialGeometryType;
    constructor(id: string, options: SpatialPlaneGeometryOptions);
}

declare class SpatialConeGeometry extends SpatialGeometry {
    id: string;
    options: SpatialConeGeometryOptions;
    static type: SpatialGeometryType;
    constructor(id: string, options: SpatialConeGeometryOptions);
}

declare class SpatialModelAsset extends SpatialObject {
    id: string;
    options: ModelAssetOptions;
    constructor(id: string, options: ModelAssetOptions);
}

declare class Attachment extends SpatialObject {
    private readonly windowProxy;
    private options;
    constructor(id: string, windowProxy: WindowProxy, options: AttachmentEntityOptions);
    getContainer(): HTMLElement;
    getWindowProxy(): WindowProxy;
    update(options: AttachmentEntityUpdateOptions): Promise<CommandResult | undefined>;
}
declare function createAttachmentEntity(options: AttachmentEntityOptions): Promise<Attachment>;

declare function initScene(name: string, callback: (pre: SpatialSceneCreationOptions$1) => SpatialSceneCreationOptions$1, options?: {
    type: SpatialSceneType$1;
}): void;

type SpatialSceneCreationOptionsInternal = SpatialSceneCreationOptions$1 & {
    type: SpatialSceneType$1;
};
declare enum SpatialSceneState {
    idle = "idle",
    pending = "pending",
    willVisible = "willVisible",
    visible = "visible",
    fail = "fail"
}

/**
 * Represents the spatial scene that contains all spatialized elements.
 * This class follows the singleton pattern - only one instance exists per application.
 * The scene manages the overall spatial environment properties and contains all spatial elements.
 */
declare class SpatialScene extends SpatialObject {
    /**
     * Gets the singleton instance of the SpatialScene.
     * Creates a new instance if one doesn't exist yet.
     * @returns The singleton SpatialScene instance
     */
    static getInstance(): SpatialScene;
    /**
     * Updates the properties of the spatial scene.
     * This can include background settings, lighting, and other scene-wide properties.
     * @param properties Partial set of properties to update
     * @returns Promise resolving when the update is complete
     */
    updateSpatialProperties(properties: Partial<SpatialSceneProperties>): Promise<CommandResult>;
    /**
     * Adds a spatialized element to the scene.
     * This makes the element visible and interactive in the spatial environment.
     * @param element The SpatializedElement to add to the scene
     * @returns Promise resolving when the element is added
     */
    addSpatializedElement(element: SpatializedElement): Promise<CommandResult>;
    /**
     * Updates the scene creation configuration.
     * This allows changing scene parameters after initial creation.
     * @param config The new scene creation configuration
     * @returns Promise resolving when the update is complete
     */
    updateSceneCreationConfig(config: SpatialSceneCreationOptionsInternal): Promise<CommandResult>;
    /**
     * Gets the current state of the spatial scene.
     * This includes information about active elements and scene configuration.
     * @returns Promise resolving to the current SpatialSceneState
     */
    getState(): Promise<SpatialSceneState>;
}

/**
 * Represents a 2D HTML element that has been spatialized in 3D space.
 * This class handles the integration between 2D web content and the 3D spatial environment,
 * allowing HTML elements to be positioned and interacted with in spatial applications.
 */
declare class Spatialized2DElement extends SpatializedElement {
    readonly windowProxy: WindowProxy;
    /**
     * Creates a new spatialized 2D element.
     * @param id Unique identifier for this element
     * @param windowProxy Reference to the window object containing the 2D content
     */
    constructor(id: string, windowProxy: WindowProxy);
    /**
     * Updates the properties of this 2D element.
     * This can include size, position, background, and other visual properties.
     * @param properties Partial set of properties to update
     * @returns Promise resolving when the update is complete
     */
    updateProperties(properties: Partial<Spatialized2DElementProperties>): Promise<CommandResult>;
    /**
     * Adds a child spatialized element to this 2D element.
     * This allows for creating hierarchical structures of spatial elements.
     * @param element The child element to add
     * @returns Promise resolving when the element is added
     */
    addSpatializedElement(element: SpatializedElement): Promise<CommandResult>;
}

/**
 * Represents a static 3D model element in the spatial environment.
 * This class handles loading and displaying pre-built 3D models from URLs,
 * and provides events for load success and failure.
 */
declare class SpatializedStatic3DElement extends SpatializedElement {
    /**
     * Creates a new spatialized static 3D element with the specified ID and URL.
     * Registers the element to receive spatial events.
     * @param id Unique identifier for this element
     * @param modelURL URL of the 3D model
     */
    constructor(id: string, modelURL: string);
    /**
     * Promise resolver for the ready state.
     * Used to resolve the ready promise when the model is loaded.
     */
    private _readyResolve?;
    /**
     * Caches the last model URL to detect changes.
     * Used to reset the ready promise when the model URL changes.
     */
    private modelURL;
    /**
     * Creates a new promise for tracking the ready state of the model.
     * @returns Promise that resolves when the model is loaded (true) or fails to load (false)
     */
    private createReadyPromise;
    /**
     * Promise that resolves when the model is loaded.
     * Resolves to true on successful load, false on failure.
     */
    ready: Promise<boolean>;
    /**
     * Updates the properties of this static 3D element.
     * Handles special case for modelURL changes by resetting the ready promise.
     * @param properties Partial set of properties to update
     * @returns Promise resolving when the update is complete
     */
    updateProperties(properties: Partial<SpatializedStatic3DElementProperties>): Promise<CommandResult>;
    /**
     * Processes events received from the WebSpatial environment.
     * Handles model loading events in addition to base spatial events.
     * @param data The event data received from the WebSpatial system
     */
    onReceiveEvent(data: {
        type: SpatialWebMsgType;
    }): void;
    /**
     * Callback function for successful model loading.
     */
    private _onLoadCallback?;
    /**
     * Sets the callback function for successful model loading.
     * @param callback Function to call when the model is loaded successfully
     */
    set onLoadCallback(callback: undefined | (() => void));
    /**
     * Callback function for model loading failure.
     */
    private _onLoadFailureCallback?;
    /**
     * Sets the callback function for model loading failure.
     * @param callback Function to call when the model fails to load
     */
    set onLoadFailureCallback(callback: undefined | (() => void));
    updateModelTransform(transform: DOMMatrixReadOnly): void;
}

/**
 * Session used to establish a connection to the spatial renderer of the system.
 * All spatial resources must be created through this session object.
 * This class serves as the main factory for creating spatial elements and geometries.
 */
declare class SpatialSession {
    /**
     * Gets the singleton instance of the spatial scene.
     * The spatial scene is the root container for all spatial elements.
     * @returns The SpatialScene singleton instance
     */
    getSpatialScene(): SpatialScene;
    /**
     * Creates a new 2D element that can be spatialized in the 3D environment.
     * 2D elements represent HTML content that can be positioned in 3D space.
     * @returns Promise resolving to a new Spatialized2DElement instance
     */
    createSpatialized2DElement(): Promise<Spatialized2DElement>;
    /**
     * Creates a new static 3D element with an optional model URL.
     * Static 3D elements represent pre-built 3D models that can be loaded from a URL.
     * @param modelURL Optional URL to the 3D model to load
     * @returns Promise resolving to a new SpatializedStatic3DElement instance
     */
    createSpatializedStatic3DElement(modelURL: string): Promise<SpatializedStatic3DElement>;
    /**
     * Initializes the spatial scene with custom configuration.
     * This is a reference to the initScene function from scene-polyfill.
     */
    initScene: typeof initScene;
    /**
     * Creates a new dynamic 3D element that can be manipulated at runtime.
     * Dynamic 3D elements allow for programmatic creation and modification of 3D content.
     * @returns Promise resolving to a new SpatializedDynamic3DElement instance
     */
    createSpatializedDynamic3DElement(): Promise<SpatializedDynamic3DElement>;
    /**
     * Creates a new spatial entity with an optional name.
     * Entities are the basic building blocks for creating custom 3D content.
     * @param name Optional name for the entity
     * @returns Promise resolving to a new SpatialEntity instance
     */
    createEntity(userData?: SpatialEntityUserData): Promise<SpatialEntity>;
    /**
     * Creates a box geometry with optional configuration.
     * @param options Configuration options for the box geometry
     * @returns Promise resolving to a new SpatialBoxGeometry instance
     */
    createBoxGeometry(options?: SpatialBoxGeometryOptions): Promise<SpatialBoxGeometry>;
    /**
     * Creates a plane geometry with optional configuration.
     * @param options Configuration options for the plane geometry
     * @returns Promise resolving to a new SpatialPlaneGeometry instance
     */
    createPlaneGeometry(options?: SpatialPlaneGeometryOptions): Promise<SpatialPlaneGeometry>;
    /**
     * Creates a sphere geometry with optional configuration.
     * @param options Configuration options for the sphere geometry
     * @returns Promise resolving to a new SpatialSphereGeometry instance
     */
    createSphereGeometry(options?: SpatialSphereGeometryOptions): Promise<SpatialSphereGeometry>;
    /**
     * Creates a cone geometry with the specified configuration.
     * @param options Configuration options for the cone geometry
     * @returns Promise resolving to a new SpatialConeGeometry instance
     */
    createConeGeometry(options: SpatialConeGeometryOptions): Promise<SpatialConeGeometry>;
    /**
     * Creates a cylinder geometry with the specified configuration.
     * @param options Configuration options for the cylinder geometry
     * @returns Promise resolving to a new SpatialCylinderGeometry instance
     */
    createCylinderGeometry(options: SpatialCylinderGeometryOptions): Promise<SpatialCylinderGeometry>;
    /**
     * Creates a model component with the specified configuration.
     * Model components are used to add 3D model rendering capabilities to entities.
     * @param options Configuration options for the model component
     * @returns Promise resolving to a new ModelComponent instance
     */
    createModelComponent(options: ModelComponentOptions): Promise<ModelComponent>;
    /**
     * Creates an unlit material with the specified configuration.
     * Unlit materials don't respond to lighting in the scene.
     * @param options Configuration options for the unlit material
     * @returns Promise resolving to a new SpatialUnlitMaterial instance
     */
    createUnlitMaterial(options: SpatialUnlitMaterialOptions): Promise<SpatialUnlitMaterial>;
    /**
     * Creates a model asset with the specified configuration.
     * Model assets represent 3D model resources that can be used by entities.
     * @param options Configuration options for the model asset
     * @returns Promise resolving to a new SpatialModelAsset instance
     */
    createModelAsset(options: ModelAssetOptions): Promise<SpatialModelAsset>;
    /**
     * Creates a spatial model entity with the specified configuration.
     * This is a convenience method for creating an entity with a model component.
     * @param options Configuration options for the spatial model entity
     * @returns Promise resolving to a new SpatialModelEntity instance
     */
    createSpatialModelEntity(options: SpatialModelEntityCreationOptions, userData?: SpatialEntityUserData): Promise<SpatialModelEntity>;
    /**
     * Creates an attachment entity that renders 2D HTML content as a child
     * of a 3D entity in the scene graph.
     * @param options Configuration options including parent entity ID, position, and size
     * @returns Promise resolving to a new Attachment instance
     */
    createAttachmentEntity(options: AttachmentEntityOptions): Promise<Attachment>;
}

/**
 * Base object designed to be placed on navigator.spatial to mirror navigator.xr for webxr.
 * This is the main entry point for the WebSpatial SDK, providing access to spatial capabilities.
 */
declare class Spatial {
    /**
     * Requests a spatial session object from the browser.
     * This is the primary method to initialize spatial functionality.
     * @returns The SpatialSession instance or null if not available in the current browser
     * [TODO] discuss implications of this not being async
     */
    requestSession(): SpatialSession | null;
    /**
     * Checks if the current page is running in a spatial web environment.
     * This method detects if the application is running in a WebSpatial-compatible browser.
     * @returns True if running in a spatial web environment, false otherwise
     */
    runInSpatialWeb(): boolean;
    /** @deprecated
     * Checks if WebSpatial is supported in the current environment.
     * Verifies compatibility between native and client versions.
     * @returns True if web spatial is supported by this webpage
     */
    isSupported(): boolean;
    /** @deprecated
     * Gets the native WebSpatial version from the browser environment.
     * The version format follows semantic versioning (x.x.x).
     * @returns Native version string in format "x.x.x"
     */
    getNativeVersion(): any;
    /** @deprecated
     * Gets the client SDK version.
     * The version format follows semantic versioning (x.x.x).
     * @returns Client SDK version string in format "x.x.x"
     */
    getClientVersion(): string;
}

declare global {
  declare const __WEBSPATIAL_CORE_SDK_VERSION__: string

  interface Window {
    xrCurrentSceneType: SpatialSceneType
    xrCurrentSceneDefaults: (
      defaultConfig: SpatialSceneCreationOptions,
    ) => Promise<SpatialSceneCreationOptions>

    // Location for webspatial custom functions
    __WebSpatialData: {
      androidNativeMessage: Function
      getNativeVersion: Function
    }

    // Location for webspatial internal callbacks (eg. completion events)
    __SpatialWebEvent: Function

    // Used to access webkit specific api
    webkit: any
    webspatialBridge: any

    // Will be removed in favor of __WebSpatialData
    WebSpatailNativeVersion: string

    __webspatialsdk__?: {
      XR_ENV?: string
      'natvie-version'?: string
      'react-sdk-version'?: string
      'core-sdk-version'?: string
    }

    innerDepth: number
    outerDepth: number
  }

  interface HTMLElement {
    offsetBack: number
    clientDepth: number
    getBoundingClientCube: () => CubeInfo | undefined
  }
}

declare const isSSREnv: () => boolean;

export { Attachment, type AttachmentEntityOptions, type AttachmentEntityUpdateOptions, type BackgroundMaterialType, type BaseplateVisibilityType, BaseplateVisibilityValues, type CornerRadius, CubeInfo$1 as CubeInfo, type ModelAssetOptions, ModelComponent, type ModelComponentOptions, type Point3D, type Quaternion, type Size, type Size3D, Spatial, SpatialBoxGeometry, type SpatialBoxGeometryOptions, SpatialComponent, SpatialConeGeometry, type SpatialConeGeometryOptions, SpatialCylinderGeometry, type SpatialCylinderGeometryOptions, type SpatialDragEndEvent, type SpatialDragEndEventDetail, type SpatialDragEvent, type SpatialDragEventDetail, type SpatialDragStartEvent, type SpatialDragStartEventDetail, SpatialEntity, type SpatialEntityEventType, type SpatialEntityOrReality, type SpatialEntityProperties, type SpatialEntityUserData, SpatialGeometry, type SpatialGeometryOptions, type SpatialGeometryType, type SpatialMagnifyEndEvent, type SpatialMagnifyEndEventDetail, type SpatialMagnifyEvent, type SpatialMagnifyEventDetail, SpatialMaterial, type SpatialMaterialType, SpatialModelAsset, type SpatialModelDragEvent, SpatialModelEntity, type SpatialModelEntityCreationOptions, SpatialObject, SpatialPlaneGeometry, type SpatialPlaneGeometryOptions, type SpatialRotateEndEvent, type SpatialRotateEndEventDetail, type SpatialRotateEvent, type SpatialRotateEventDetail, SpatialScene, type SpatialSceneCreationOptions$1 as SpatialSceneCreationOptions, type SpatialSceneProperties, SpatialSceneState$1 as SpatialSceneState, type SpatialSceneType$1 as SpatialSceneType, SpatialSceneValues, SpatialSession, SpatialSphereGeometry, type SpatialSphereGeometryOptions, type SpatialTapEvent, type SpatialTapEventDetail, SpatialUnlitMaterial, type SpatialUnlitMaterialOptions, Spatialized2DElement, type Spatialized2DElementProperties, SpatializedDynamic3DElement, SpatializedElement, type SpatializedElementProperties, SpatializedElementType, SpatializedStatic3DElement, type SpatializedStatic3DElementProperties, type Vec3, type WorldAlignmentType, WorldAlignmentValues, type WorldScalingType, WorldScalingValues, createAttachmentEntity, isSSREnv, isValidBaseplateVisibilityType, isValidSceneUnit, isValidSpatialSceneType, isValidWorldAlignmentType, isValidWorldScalingType };
