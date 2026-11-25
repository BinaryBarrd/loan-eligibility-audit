// Every question in the study, as data. Keys (q1, q6b_1, …) are the column names in the saved answers
// and follow the numbering in the study plan. Wording is neutral and the same for every participant.

export const PNTS = 'Prefer not to say';

const agree = { kind: 'scale', ends: ['Strongly disagree', 'Strongly agree'] };
const understand = { kind: 'scale', ends: ['Not at all', 'Very well'] };

/** Screen 2. Questions 1 to 4 are required with no "Prefer not to say"; the rest offer it. */
export const BACKGROUND = [
  { group: 'Background' },
  { key: 'q1', kind: 'radio', text: 'Your age group',
    options: ['18–20', '21–24', '25–29', '30–34', '35–44', '45–54', '55–60', 'Over 60'] },
  { key: 'q2', kind: 'radio', text: 'Your occupation', other: true,
    options: ['Student', 'Salaried, private company', 'Salaried, government or public sector', 'Self-employed or own business',
      'Professional in own practice (doctor, CA, lawyer, architect)', 'Homemaker', 'Retired', 'Not working', 'Other'] },
  { key: 'q3', kind: 'radio', text: 'Your field of education', other: true,
    options: ['Engineering or technology', 'Science', 'Commerce, finance or economics', 'Management', 'Medicine or health', 'Law',
      'Arts, humanities or social sciences', 'Other'] },
  { key: 'q4', kind: 'radio', text: 'Your level of study',
    options: ['Up to Class 12', 'Diploma', 'Undergraduate, studying', 'Undergraduate, completed', 'Postgraduate, studying',
      'Postgraduate, completed', 'Doctorate'] },

  { group: 'Your experience', help: 'Each of these can be skipped with “Prefer not to say”.' },
  { key: 'q5', kind: 'radio', pnts: true, text: 'Have you ever taken a personal loan?', options: ['Yes', 'No'] },
  { key: 'q6', kind: 'radio', pnts: true, text: 'Have you used an online loan eligibility calculator before?', options: ['Yes', 'No', 'Not sure'] },
  { key: 'q6c', kind: 'radio', pnts: true, text: 'Are you looking for a loan now, or do you expect to in the next 12 months?', options: ['Yes', 'No', 'Not sure'] },
  { key: 'q6d', kind: 'radio', pnts: true, text: 'Do you work, or have you worked, in banking, finance or lending?', options: ['Yes', 'No'] },
  { key: 'q6e', kind: 'radio', pnts: true, text: 'Do you work, or have you worked, on building software, data or AI systems?', options: ['Yes', 'No'] },
  { key: 'q6f', kind: 'radio', pnts: true, text: 'Have you ever checked your own credit score?', options: ['Yes', 'No', 'I’m not sure what that is'] },
  { key: 'q6a', ...understand, pnts: true, text: 'How well do you understand how EMIs and interest rates work?' },
  { key: 'q6g', ...understand, pnts: true, text: 'How well do you understand how automated or AI systems reach their decisions?' },

  { group: 'How much do you agree?' },
  // Question 6b: "Trusting Stance—General Technology", word for word and in the published order.
  // McKnight, Carter, Thatcher & Clay (2011), "Trust in a specific technology: An investigation of its
  // components and measures", ACM TMIS 2(2), Article 12, Appendix B (Cronbach's alpha 0.86, Appendix E).
  // The paper does not state its answer scale; this uses the 1–5 agree scale of Frazier, Johnson &
  // Fainshmidt (2013), Journal of Trust Research 3(2), 76–97. Score: the mean of the three items (none
  // is reverse-scored); report alpha for this sample.
  { key: 'q6b_1', ...agree, pnts: true, statement: true, text: 'My typical approach is to trust new technologies until they prove to me that I shouldn’t trust them.' },
  { key: 'q6b_2', ...agree, pnts: true, statement: true, text: 'I usually trust a technology until it gives me a reason not to trust it.' },
  { key: 'q6b_3', ...agree, pnts: true, statement: true, text: 'I generally give a technology the benefit of the doubt when I first use it.' },
  { key: 'q6h', ...agree, pnts: true, statement: true, text: 'In general, I trust banks and lenders to treat customers fairly.' },
];

/** Occupations that use the self-employed version of the one calculator that has one. */
export const SELF_EMPLOYED = ['Self-employed or own business', 'Professional in own practice (doctor, CA, lawyer, architect)'];

/** Screen 3: the numbers. Defaults only for tenure and rate, as the plan says. */
export const NUMBERS = [
  { key: 'income', label: 'Your monthly income', unit: '₹', help: 'Take-home pay each month.' },
  { key: 'emis', label: 'Monthly EMIs you already pay', unit: '₹', help: 'Instalments on loans you already have. Type 0 if none.' },
  { key: 'other', label: 'Other monthly expenses', unit: '₹', help: 'Rent, bills and other regular costs. Type 0 if none.' },
  { key: 'wanted', label: 'Loan amount you want', unit: '₹' },
  { key: 'age', label: 'Your age', unit: 'years' },
  { key: 'years', label: 'How many years you would repay over', unit: 'years', def: 5, help: 'From 1 to 10 years. 5 years is typical.' },
  { key: 'rate', label: 'Yearly interest rate', unit: '%', def: 10, decimal: true, help: '10% is a typical starting point. Some calculators use the rate you type here.' },
];

/** Screen 5. Question 7's options are the lenders, filled in at run time. */
export const CHOICE = [
  { key: 'q8', kind: 'checks', when: 'lender', other: true, text: 'What made you choose it? Pick all that apply.',
    options: ['The largest amount', 'An amount close to what I need', 'It seemed more trustworthy', 'I picked at random', 'Other'] },
  { key: 'q8a', kind: 'checks', when: 'none', other: true, text: 'Why none of them? Pick all that apply.',
    options: ['The amounts are too low', 'I don’t trust online calculators', 'I don’t need a loan', 'Other'] },
  { key: 'q9', kind: 'scale', ends: ['Not at all', 'Completely'], text: 'How much do you trust these amounts as what a lender would really offer you?' },
  { key: 'q10', kind: 'scale', ends: ['Not at all', 'Very'], text: 'How surprised are you that the nine amounts differ?' },
];

/** Screen 6, after the assumptions are shown. Question 11's lender list is filled in at run time. */
export const AFTER = [
  { key: 'q12', kind: 'scale', ends: ['Not at all', 'Completely'], text: 'How much do you trust the amounts now?' },
  { key: 'q13', kind: 'radio', other: true, text: 'What surprised you most?',
    options: ['The interest rate it assumed', 'The share of income it allows', 'The tenure it really uses', 'The upper limit on the amount',
      'That none uses a credit score', 'Nothing', 'Other'] },
];

export const TEXT_LIMIT = 100;
export const TEXT_HELP = 'Please don’t include your name or anything that identifies you.';
