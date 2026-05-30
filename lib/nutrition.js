/**
 * Scientific nutrition calculations
 * Based on:
 * - Mifflin-St Jeor (1990) for BMR — most validated by the Academy of Nutrition and Dietetics
 * - Ainsworth Physical Activity Compendium for activity multipliers  
 * - WHO/FAO/UNU (2004) for protein requirements
 * - Institute of Medicine DRI (2005) for micronutrients
 * - MyFitnessPal uses identical Mifflin-St Jeor + 1.2/1.375/1.55/1.725/1.9 multipliers
 */

/**
 * BMR — Mifflin-St Jeor Equation (1990)
 * Validated as most accurate for most populations
 * Error rate ≈ ±10% vs doubly labeled water studies
 */
export function calcBMR(weight_kg, height_cm, age, sex = 'male') {
  if (!weight_kg || !height_cm || !age || age < 15 || age > 100) return 0
  const base = (10 * weight_kg) + (6.25 * height_cm) - (5 * age)
  return sex === 'female' ? base - 161 : base + 5
}

/**
 * TDEE = BMR × Physical Activity Level (PAL)
 * Activity multipliers from Ainsworth et al. (2011) Compendium of Physical Activities
 * These are the EXACT same multipliers used by MyFitnessPal and most nutrition apps:
 * 
 * Sedentary (1.2):      Little/no exercise, desk job
 * Light (1.375):        Light exercise 1-3 days/week
 * Moderate (1.55):      Moderate exercise 3-5 days/week  
 * Active (1.725):       Hard exercise 6-7 days/week
 * Very Active (1.9):    Very hard exercise, physical job or 2x training
 */
export function calcTDEE(bmr, fitness_level = 'intermediate') {
  const PAL = {
    beginner:     1.375,  // Lightly active (1-3 days/week)
    intermediate: 1.55,   // Moderately active (3-5 days/week)
    advanced:     1.725,  // Very active (6-7 days/week)
    expert:       1.9,    // Extra active (athlete / 2x/day)
  }
  return Math.round(bmr * (PAL[fitness_level] || 1.55))
}

/**
 * Calorie target adjusted for goal
 * Based on energy balance research:
 * - 500 kcal deficit ≈ 0.5kg/week loss (Hall et al., 2012)
 * - 250-500 kcal surplus for muscle gain (Helms et al., 2014)
 */
export function calcCalorieGoal(tdee, goal = 'general') {
  const adjustments = {
    weight_loss: -500,   // Safe deficit: ~0.5kg/week fat loss
    muscle:      +300,   // Lean bulk: minimize fat gain
    strength:    +200,   // Slight surplus for strength
    endurance:   +100,   // Maintenance +
    general:        0,   // Maintenance
  }
  // Never go below 1200 (women) / 1500 (men) — but we don't track sex here easily
  return Math.max(1200, Math.round(tdee + (adjustments[goal] || 0)))
}

/**
 * Complete daily nutrient goals
 * Sources: NIH, WHO, Academy of Nutrition and Dietetics, ISSN Position Stands
 */
export function calcNutrientGoals(profile) {
  const {
    weight_kg, height_cm, birthday,
    fitness_level = 'intermediate',
    goal = 'general',
    sex = 'male',
    unit_system = 'metric'
  } = profile || {}

  // Unit conversion
  const wkg = unit_system === 'imperial' ? (parseFloat(weight_kg) || 70) * 0.453592 : (parseFloat(weight_kg) || 70)
  const hcm = unit_system === 'imperial' ? (parseFloat(height_cm) || 170) * 2.54 : (parseFloat(height_cm) || 170)
  const age = birthday
    ? Math.max(15, Math.floor((Date.now() - new Date(birthday).getTime()) / (365.25 * 86400000)))
    : 30

  const bmr = calcBMR(wkg, hcm, age, sex)
  const tdee = calcTDEE(bmr, fitness_level)
  const calories = calcCalorieGoal(tdee, goal)

  // ── Protein (ISSN Position Stand 2017) ──────────────────────────────────
  // Recreational athletes: 1.4–1.7 g/kg
  // Strength/power athletes: 1.6–2.0 g/kg
  // Weight loss (preserve LBM): 1.8–2.4 g/kg
  const proteinPerKg = {
    weight_loss: 2.2,   // Higher to preserve lean mass during deficit
    muscle:      2.0,   // Hypertrophy range
    strength:    1.8,   // Strength training
    endurance:   1.6,   // Endurance athletes
    general:     1.6,   // General fitness
  }[goal] || 1.6
  const protein_g = Math.round(wkg * proteinPerKg)

  // ── Carbohydrates ────────────────────────────────────────────────────────
  // After protein calories, split remaining between carbs and fat
  const proteinCals = protein_g * 4
  const remainingCals = calories - proteinCals

  // Fat: 25-35% of total calories (AHA/ACC guidelines)
  const fatPct = goal === 'weight_loss' ? 0.25 : goal === 'endurance' ? 0.20 : 0.28
  const fat_g = Math.round((calories * fatPct) / 9)

  // Carbs: fill the rest
  const carbCals = calories - proteinCals - (fat_g * 9)
  const carbs_g = Math.max(130, Math.round(carbCals / 4)) // Min 130g (brain minimum)

  // ── Fats breakdown ───────────────────────────────────────────────────────
  const saturated_fat_g    = Math.round((calories * 0.07) / 9)  // <7% (ACC/AHA)
  const polyunsaturated_fat_g = Math.round((calories * 0.10) / 9) // 10%
  const monounsaturated_fat_g = Math.round((calories * 0.12) / 9) // 12%
  const trans_fat_g        = 2  // WHO: as low as possible

  // ── Fiber (Institute of Medicine) ───────────────────────────────────────
  // 14g per 1000 kcal, or 25g (women) / 38g (men)
  const fiber_g = sex === 'female' ? 25 : 38

  // ── Sugar (WHO 2015) ─────────────────────────────────────────────────────
  // <10% free sugars; <5% for additional benefits
  const sugar_g = Math.round((calories * 0.10) / 4)

  // ── Micronutrients (NIH DRI 2020) ────────────────────────────────────────
  const isFemale  = sex === 'female'
  const isOlder50 = age > 50

  return {
    // Energy
    calories,
    bmr:  Math.round(bmr),
    tdee,
    age,

    // Macros
    protein_g,
    carbs_g,
    fat_g,
    fiber_g,
    sugar_g,
    saturated_fat_g,
    polyunsaturated_fat_g,
    monounsaturated_fat_g,
    trans_fat_g,

    // Electrolytes (NIH 2020)
    cholesterol_mg:  300,
    sodium_mg:       2300,  // AHA ideal: <1500mg; upper limit: 2300mg
    potassium_mg:    isFemale ? 2600 : 3400,  // AI values

    // Vitamins
    vitamin_a_mcg:   isFemale ? 700 : 900,   // RAE
    vitamin_c_mg:    isFemale ? 75 : 90,

    // Minerals
    calcium_mg:      (isFemale && isOlder50) ? 1200 : (isOlder50 ? 1200 : 1000),
    iron_mg:         (isFemale && !isOlder50) ? 18 : 8,

    // Water (EFSA 2010)
    water_ml:        isFemale ? 2000 : 2500,
  }
}

export function fmt(n, decimals = 0) {
  if (n === null || n === undefined) return '—'
  const rounded = decimals > 0 ? Math.round(n * 10**decimals) / 10**decimals : Math.round(n)
  return String(rounded)
}
