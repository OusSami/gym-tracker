/**
 * Deep muscle taxonomy
 * Each major group has sub-muscles for precise targeting
 */
export const MUSCLE_TREE = {
  Chest: {
    color: '#ef4444',
    icon: '🫁',
    subs: ['Upper Chest', 'Mid Chest', 'Lower Chest', 'Inner Chest']
  },
  Back: {
    color: '#3b82f6',
    icon: '🔙',
    subs: ['Lats', 'Upper Traps', 'Middle Traps', 'Lower Traps', 'Rhomboids', 'Erector Spinae', 'Teres Major']
  },
  Shoulders: {
    color: '#a855f7',
    icon: '💪',
    subs: ['Front Delts', 'Side Delts', 'Rear Delts', 'Rotator Cuff']
  },
  Arms: {
    color: '#f97316',
    icon: '💪',
    subs: ['Biceps', 'Triceps', 'Forearms', 'Brachialis', 'Brachioradialis']
  },
  Legs: {
    color: '#22c55e',
    icon: '🦵',
    subs: ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Hip Flexors', 'Adductors', 'Abductors']
  },
  Core: {
    color: '#eab308',
    icon: '🔥',
    subs: ['Abs', 'Obliques', 'Lower Back', 'Transverse Abdominis', 'Hip Flexors']
  },
  Cardio: {
    color: '#06b6d4',
    icon: '❤️',
    subs: ['HIIT', 'Steady State', 'Intervals', 'Circuit']
  },
}

// Flat list of ALL muscles (main + subs) for the edit dropdown
export const ALL_MUSCLES_FLAT = Object.entries(MUSCLE_TREE).flatMap(([main, { subs }]) => [
  main,
  ...subs.map(s => `${main} › ${s}`)
])

// Get parent group from a muscle string
export const getMuscleGroup = (muscle) => {
  if (!muscle) return 'Other'
  const base = muscle.split(' › ')[0]
  return MUSCLE_TREE[base] ? base : muscle
}

// Get color for any muscle (including sub-muscles)
export const getMuscleColor = (muscle) => {
  if (!muscle) return '#6b7280'
  const group = getMuscleGroup(muscle)
  return MUSCLE_TREE[group]?.color || '#6b7280'
}

// Format for display - show just the sub-part if it has one
export const displayMuscle = (muscle) => {
  if (!muscle) return ''
  const parts = muscle.split(' › ')
  return parts.length > 1 ? parts[1] : parts[0]
}

/**
 * Normalize any muscle name (from AI or user input) to our canonical sub-muscle.
 * Handles alternate spellings, anatomical names, abbreviations.
 * Returns the canonical name if found, otherwise returns input unchanged.
 */
export const MUSCLE_ALIASES = {
  // Shoulders
  'Anterior Deltoid':'Front Delts','Anterior Delt':'Front Delts','Front Deltoid':'Front Delts','Front Delt':'Front Delts',
  'Lateral Deltoid':'Side Delts','Lateral Delt':'Side Delts','Medial Deltoid':'Side Delts','Medial Delt':'Side Delts',
  'Middle Delt':'Side Delts','Middle Deltoid':'Side Delts','Deltoid':'Side Delts','Delts':'Side Delts',
  'Posterior Deltoid':'Rear Delts','Posterior Delt':'Rear Delts','Rear Deltoid':'Rear Delts','Rear Delt':'Rear Delts',
  'Shoulder':'Side Delts',
  // Chest
  'Pectoralis Major':'Mid Chest','Pectoralis Minor':'Upper Chest','Pec':'Mid Chest','Pecs':'Mid Chest',
  'Upper Pec':'Upper Chest','Upper Pecs':'Upper Chest','Upper Pectoralis':'Upper Chest','Clavicular Head':'Upper Chest',
  'Sternal Head':'Mid Chest','Lower Pec':'Lower Chest','Lower Pecs':'Lower Chest','Lower Pectoralis':'Lower Chest',
  'Inner Pec':'Inner Chest','Inner Pecs':'Inner Chest','Chest':'Mid Chest',
  // Back
  'Latissimus Dorsi':'Lats','Lat':'Lats','Latissimus':'Lats',
  'Trapezius':'Upper Traps','Trap':'Upper Traps','Traps':'Upper Traps','Upper Trapezius':'Upper Traps',
  'Middle Trapezius':'Middle Traps','Mid Traps':'Middle Traps','Lower Trapezius':'Lower Traps',
  'Rhomboid':'Rhomboids','Rhomboid Major':'Rhomboids','Rhomboid Minor':'Rhomboids',
  'Erector':'Erector Spinae','Spinal Erectors':'Erector Spinae','Lower Back':'Erector Spinae',
  'Teres':'Teres Major','Teres Minor':'Teres Major',
  // Arms
  'Biceps Brachii':'Biceps','Bicep':'Biceps','Triceps Brachii':'Triceps','Tricep':'Triceps',
  'Long Head Biceps':'Biceps','Short Head Biceps':'Biceps',
  'Long Head Triceps':'Triceps','Lateral Head Triceps':'Triceps','Medial Head Triceps':'Triceps',
  'Triceps Brachii (Lateral Head)':'Triceps','Triceps Brachii (Long Head)':'Triceps','Triceps Brachii (Medial Head)':'Triceps',
  'Forearm':'Forearms','Forearm Flexors':'Forearms','Forearm Extensors':'Forearms',
  'Wrist Flexors':'Forearms','Wrist Extensors':'Forearms',
  // Legs
  'Quadriceps':'Quads','Quad':'Quads','Vastus Lateralis':'Quads','Vastus Medialis':'Quads',
  'Rectus Femoris':'Quads','Vastus Intermedius':'Quads',
  'Hamstring':'Hamstrings','Biceps Femoris':'Hamstrings','Semitendinosus':'Hamstrings','Semimembranosus':'Hamstrings',
  'Gluteus Maximus':'Glutes','Gluteus Medius':'Glutes','Gluteus Minimus':'Glutes','Glute':'Glutes',
  'Gastrocnemius':'Calves','Soleus':'Calves','Calf':'Calves','Gastrocnemius/Soleus':'Calves',
  'Hip Flexor':'Hip Flexors','Iliopsoas':'Hip Flexors','Psoas':'Hip Flexors',
  'Adductor':'Adductors','Adductor Magnus':'Adductors','Inner Thigh':'Adductors',
  'Abductor':'Abductors','Outer Thigh':'Abductors',
  // Core
  'Rectus Abdominis':'Abs','Ab':'Abs','Six Pack':'Abs',
  'Oblique':'Obliques','Internal Oblique':'Obliques','External Oblique':'Obliques',
  'TVA':'Transverse Abdominis',
}

/**
 * Normalize a raw muscle name from AI to our canonical taxonomy.
 * 1. Exact match in aliases
 * 2. Case-insensitive match in aliases
 * 3. Direct match against known sub-muscles
 * 4. Direct match against group names
 * 5. Return input unchanged
 */
export const normalizeMuscle = (raw) => {
  if (!raw) return raw
  const str = String(raw).trim()

  // 0. Handle "Group › Sub" format - normalize just the sub part
  if (str.includes(' › ')) {
    const parts = str.split(' › ')
    const sub = parts[parts.length - 1].trim()
    return normalizeMuscle(sub) // recursively normalize the sub-muscle name
  }

  // 1. Exact alias match
  if (MUSCLE_ALIASES[str]) return MUSCLE_ALIASES[str]

  // 2. Case-insensitive alias match
  const lower = str.toLowerCase()
  const aliasKey = Object.keys(MUSCLE_ALIASES).find(k => k.toLowerCase() === lower)
  if (aliasKey) return MUSCLE_ALIASES[aliasKey]

  // 3. Already a known sub-muscle
  const allSubs = Object.values(MUSCLE_TREE).flatMap(g => g.subs)
  if (allSubs.includes(str)) return str
  const subMatch = allSubs.find(s => s.toLowerCase() === lower)
  if (subMatch) return subMatch

  // 4. Already a known group
  if (MUSCLE_TREE[str]) return str
  const groupMatch = Object.keys(MUSCLE_TREE).find(k => k.toLowerCase() === lower)
  if (groupMatch) return groupMatch

  // 5. Return as-is - unknown muscle, don't corrupt it
  return str
}
