// The panel parts both studios share (501, docs/DESIGN.md).
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { FOLDS_KEY, opensNow, readFolds, resolveFold, saveFold, toggleFold, type FoldOpen } from './foldGroups';
export { FoldGroup, FoldSection, collapseAll, revealSection, type FoldGroupProps, type FoldSectionProps } from './FoldSection';
export { ListRow, type ListRowProps } from './ListRow';
export { PanelHeader, type PanelHeaderProps } from './PanelHeader';
export { RAIL_KEY, railWidth, readRailWidth, saveRailWidth, type RailWidth } from './railWidth';
export { RailFrame, useRailWidth, type RailFrameProps } from './RailFrame';
