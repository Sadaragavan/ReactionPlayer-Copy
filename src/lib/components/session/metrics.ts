/**
 * Sizes (px) shared by the docked HUD and the stage. The stage is inset by
 * exactly the space the HUD occupies, so both read the same numbers instead of
 * measuring each other — which keeps the morph between linked and unlinked
 * perfectly in step (they also share MORPH).
 */
export const TOP_H = 44;
export const LANE_H = 36;
export const PANEL_W = 296;

/** One easing and one duration for everything that moves when the transport morphs. */
export const MORPH = '380ms cubic-bezier(0.65, 0, 0.35, 1)';

/** Lanes on screen: one master bar when linked, one per video when not. */
export const laneCount = (videos: number, linked: boolean) => (linked ? 1 : Math.max(1, videos));

/** The bottom dock is its lanes plus a one-pixel hairline on top. */
export const dockHeight = (lanes: number) => lanes * LANE_H + 1;
