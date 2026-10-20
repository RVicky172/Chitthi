import { KIND_NAMES, kindClass, type SoundKind } from './soundKinds';

/**
 * A kind of sound as a small coloured chip with its name (505 §4).
 * @param props the kind
 * @param props.kind Music, Voice or Effects
 */
export function KindChip({ kind }: Readonly<{ kind: SoundKind }>) {
  return <span className={`kind-chip ${kindClass(kind)}`}>{KIND_NAMES[kind]}</span>;
}
