export const MISTAKE_DEDUCTIONS = {
  "None": 0,
  "Address": 300,
  "North Point": 300,
  "Floor Label": 300,
  "Measurements": 300,
  "Area": 200,
  "Label": 100,
  "Under Stair RH": 25,
  "Template": 25,
  "Entrance Arrow": 25,
  "Arrow Head": 25,
  "Room Parts": 25,
  "Door & Window": 25
};

export const MISTAKE_TYPES = Object.keys(MISTAKE_DEDUCTIONS);

export const REGIONS = ['Standard', 'UK', 'AUS'];

export const CLIENT_LIST = ['Archipro', 'Red2', 'Drafting Co', 'Express Plans', 'Vector Studio', 'BuildLine'];

/**
 * Calculates pricing for a floorplan job based on job parameters and total lifetime job count.
 * @param {Object} data - Raw job parameters
 * @param {number} totalJobCount - Total job count before this job (lifetime)
 * @returns {Object} { price, no_mistake_amount, ddt_amount, total }
 */
export function calculatePricing(data, totalJobCount = 0) {
  let basePrice = 0;
  
  const isColor = Boolean(data.is_color);
  const isNightOrWeekend = Boolean(data.is_night_or_weekend);
  const areaSqft = parseFloat(data.area_sqft) || 0;
  const region = data.region || 'Standard';
  const mistakeType = data.mistake_type || 'None';

  // 1. Allowance: LKR 25 no_mistake_amount if mistake_type is "None"
  const no_mistake_amount = (mistakeType === 'None') ? 25 : 0;

  // 2. Dynamic Area-based Color Pricing
  // Area <= 1000 sqft adds LKR 25; each additional 1000 sqft adds LKR 25
  let colorPrice = 0;
  if (isColor) {
    colorPrice = areaSqft <= 1000 ? 25 : 25 + Math.ceil((areaSqft - 1000) / 1000) * 25;
  }

  // 3. Tier Pricing & Base Price Calculation
  // First 100 lifetime jobs (weekday daytime): Base Price = 0 + Color extra (+ LKR 0.25/sqft over 5000 sqft)
  if (totalJobCount < 100 && !isNightOrWeekend) {
    basePrice = 0;
    if (isColor) {
      basePrice += colorPrice;
    }
    if (areaSqft > 5000) {
      basePrice += (areaSqft - 5000) * 0.25;
    }
  } else {
    // Regular Tiers (Post-100 jobs or Night/Weekend)
    if (region === 'Standard') {
      if (areaSqft <= 1000) basePrice = 200;
      else if (areaSqft <= 2000) basePrice = 250;
      else basePrice = 300; // > 2000 sqft
    } else if (region === 'UK' || region === 'AUS') {
      if (areaSqft <= 1000) basePrice = 300;
      else if (areaSqft <= 2000) basePrice = 350;
      else basePrice = 400; // > 2000 sqft
    }

    if (isColor) {
      basePrice += colorPrice;
    }

    if (areaSqft > 2500) {
      basePrice += (areaSqft - 2500) * 0.25;
    }
  }

  // 4. Mistake Deductions
  const ddt_amount = MISTAKE_DEDUCTIONS[mistakeType] !== undefined ? MISTAKE_DEDUCTIONS[mistakeType] : 0;

  // 5. Total Earnings calculation
  const total = basePrice + no_mistake_amount - ddt_amount;

  return {
    price: basePrice,
    no_mistake_amount,
    ddt_amount,
    total
  };
}
