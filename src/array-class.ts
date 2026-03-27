// TODO (Phase 7): implement parser for Latte array class syntax
//
// Latte v3 syntax:
//   <div class={[btn, flex, active => $isActive, $dyn]}>   (bare identifiers)
//   <div class={['btn', 'flex', 'active' => $isActive]}>   (quoted strings)
//
// Item types:
//   plain   — bare/quoted CSS class without condition
//   keyed   — CSS class as key + "=> condition" (atomic pair!)
//   dynamic — dynamic value (unchanged)
//
// Invariant: staticItems.length === sortedClasses.length
//   Any item with empty class name must be classified as dynamic
// Invariant: keyed pairs are atomic — key and condition (=> $x) always move together

export interface ArrayClassItem {
  type: 'plain' | 'keyed' | 'dynamic'
  raw: string
  /** CSS class name (plain/keyed) */
  className?: string
  /** Condition after => (keyed) */
  condition?: string
  /** Whether the class name is quoted or bare (plain/keyed) */
  quoted?: boolean
}

export function parseArrayClass(_value: string): ArrayClassItem[] {
  // TODO: implement
  return []
}

export function serializeArrayClass(_items: ArrayClassItem[]): string {
  // TODO: implement
  return ''
}
