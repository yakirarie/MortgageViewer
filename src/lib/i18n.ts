import { useState } from 'react';

type Language = 'en' | 'he';

interface Translations {
  common: {
    appName: string;
    manageTracks: string;
    settings: string;
    save: string;
    load: string;
    close: string;
    cancel: string;
    confirm: string;
    delete: string;
    duplicate: string;
    moveUp: string;
    moveDown: string;
    addTrack: string;
    noTracks: string;
    loadDemoProfile: string;
    currency: string;
    months: string;
    percent: string;
  };
  header: {
    profile: string;
  };
  sidebar: {
    profileSummary: string;
    manageTracks: string;
  };

  kpi: {
    totalOutstandingBalance: string;
    weightedAvgInterestRate: string;
    blendedMonthlyRepayment: string;
    estTotalRemainingInterest: string;
    invalidTracks: string;
  };
  tabs: {
    portfolio: string;
    payoff: string;
    refinance: string;
    recommendations: string;
  };
  portfolio: {
    title: string;
    balanceDistribution: string;
    trackDiagnostics: string;
    name: string;
    type: string;
    balance: string;
    rate: string;
    portfolioPercent: string;
    monthlyPmt: string;
    termLeft: string;
    resetWindow: string;
    penalty: string;
    weightedRateBreakdown: string;
    portfolioAvg: string;
    resetTimeline: string;
    noResetWindows: string;
    resetIn: string;
  };
  payoff: {
    title: string;
    availableLumpSum: string;
    allocation: string;
    mode: string;
    reduceTerm: string;
    reducePayment: string;
    noticeWaived: string;
    noticeWaivedDescription: string;
    suggestOptimalAllocation: string;
    suggestOptimalTooltip: string;
    max: string;
    totalAllocated: string;
    remainingToAllocate: string;
    resultsByTrack: string;
    allocated: string;
    interestSaved: string;
    penaltyFees: string;
    netBenefit: string;
    payoffDiagnostics: string;
    totalPayoffOutlay: string;
    guaranteedInterestSaved: string;
    monthlyCashflowRelief: string;
    disclaimer: string;
    disclaimerText: string;
    noticeWaivedNote: string;
  };

  refinance: {
    title: string;
    selectTracks: string;
    newOfferDetails: string;
    newRate: string;
    newTerm: string;
    otherFees: string;
    refinancingAnalysis: string;
    oldMonthlyPayment: string;
    newMonthlyPayment: string;
    monthlySavings: string;
    totalSwitchingCosts: string;
    breakevenMonth: string;
    neverBreaksEven: string;
    lifetimeNetSavings: string;
    sensitivityAnalysis: string;
    rate: string;
    breakeven: string;
    lifetimeSavings: string;
    selectTracksToSee: string;
  };
  recommendations: {
    title: string;
    priorityRanking: string;
    sortedByActionPriority: string;
    riskActionMatrix: string;
    track: string;
    recommendedAction: string;
    confidenceDriver: string;
    resetWindow: string;
    penaltyExposure: string;
    ruleEngineReference: string;
    rule1: string;
    rule1Desc: string;
    rule2: string;
    rule2Desc: string;
    rule3: string;
    rule3Desc: string;
    rule4: string;
    rule4Desc: string;
    weightedRate: string;
    payOffNow: string;
    waitForReset: string;
    hold: string;
    reason: string;
  };

  trackForm: {
    trackType: string;
    trackName: string;
    principalBalance: string;
    annualInterestRate: string;
    remainingTermMonths: string;
    monthlyRepayment: string;
    isPaymentManual: string;
    earlyExitPenalty: string;
    noticeFee: string;
    monthsToReset: string;
    isCpiLinked: string;
    auto: string;
    editTrack: string;
    addTrack: string;
  };
  trackTypes: {
    PRIME: string;
    FIXED_UNLINKED: string;
    FIXED_LINKED: string;
    VARIABLE_5Y: string;
    VARIABLE_5Y_LINKED: string;
    OTHER: string;
  };
  emptyState: {
    title: string;
    description: string;
    loadDemoProfile: string;
  };
  validation: {
    required: string;
    invalidNumber: string;
    minValue: string;
    maxValue: string;
    trackNameRequired: string;
    trackNameMaxLength: string;
  };
}

const translations: Record<Language, Translations> = {
  en: {
    common: {
      appName: 'Mashkanta Decision Engine',
      manageTracks: 'Manage Tracks',
      settings: 'Settings',
      save: 'Save',
      load: 'Load',
      close: 'Close',
      cancel: 'Cancel',
      confirm: 'Confirm',
      delete: 'Delete',
      duplicate: 'Duplicate',
      moveUp: 'Move Up',
      moveDown: 'Move Down',
      addTrack: 'Add Track',
      noTracks: 'No tracks yet',
      loadDemoProfile: 'Load Demo Profile',
      currency: '₪',
      months: 'months',
      percent: '%',
    },
    header: {
      profile: 'Profile:',
    },
    sidebar: {
      profileSummary: 'Profile Summary',
      manageTracks: 'Manage Tracks →',
    },

    kpi: {
      totalOutstandingBalance: 'Total Outstanding Balance',
      weightedAvgInterestRate: 'Weighted Avg. Interest Rate',
      blendedMonthlyRepayment: 'Blended Monthly Repayment',
      estTotalRemainingInterest: 'Est. Total Remaining Interest',
      invalidTracks: 'Some tracks have invalid interest rates',
    },
    tabs: {
      portfolio: 'Portfolio & Diagnostics',
      payoff: 'Early Payoff',
      refinance: 'Refinancing',
      recommendations: 'Recommendations',
    },
    portfolio: {
      title: 'Portfolio & Diagnostics',
      balanceDistribution: 'Balance Distribution',
      trackDiagnostics: 'Track Diagnostics',
      name: 'Name',
      type: 'Type',
      balance: 'Balance',
      rate: 'Rate',
      portfolioPercent: '% of Portfolio',
      monthlyPmt: 'Monthly Pmt',
      termLeft: 'Term Left',
      resetWindow: 'Reset Window',
      penalty: 'Penalty',
      weightedRateBreakdown: 'Weighted Rate Breakdown',
      portfolioAvg: 'Portfolio Avg:',
      resetTimeline: 'Reset Timeline',
      noResetWindows: 'No tracks with reset windows',
      resetIn: 'Reset in',
    },
    payoff: {
      title: 'Early Payoff & Lump-Sum Simulator',
      availableLumpSum: 'Available Lump Sum (₪):',
      allocation: 'Allocation',
      mode: 'Mode:',
      reduceTerm: 'Reduce Term',
      reducePayment: 'Reduce Payment',
      noticeWaived: '10+ days notice (waive fee)',
      noticeWaivedDescription: 'Notice fee waived — 10-day advance notice rule (Amlat Hoda\'a Mukdamet) applied.',
      suggestOptimalAllocation: 'Suggest Optimal Allocation',
      suggestOptimalTooltip: 'Suggests an efficient allocation, not a guaranteed-optimal one',
      max: 'Max:',
      totalAllocated: 'Total Allocated:',
      remainingToAllocate: 'remaining to allocate',
      resultsByTrack: 'Results by Track',
      allocated: 'allocated',
      interestSaved: 'Interest Saved',
      penaltyFees: 'Penalty + Fees',
      netBenefit: 'Net Benefit',
      payoffDiagnostics: 'Payoff Diagnostics',
      totalPayoffOutlay: 'Total Payoff Outlay',
      guaranteedInterestSaved: 'Guaranteed Interest Saved',
      monthlyCashflowRelief: 'Monthly Cashflow Relief',
      disclaimer: 'Disclaimer:',

      disclaimerText: 'Mortgage payoff is a guaranteed, risk-free return. Market investment returns are not guaranteed. This comparison does not account for capital gains tax, or your personal risk tolerance.',
      noticeWaivedNote: 'Notice fee waived — 10-day advance notice rule (Amlat Hoda\'a Mukdamet) applied.',
    },
    refinance: {
      title: 'Refinancing Breakeven Engine',
      selectTracks: 'Select Tracks to Refinance',
      newOfferDetails: 'New Offer Details',
      newRate: 'New Rate (%)',
      newTerm: 'New Term (months)',
      otherFees: 'Other Fees (₪)',
      refinancingAnalysis: 'Refinancing Analysis',
      oldMonthlyPayment: 'Old Monthly Payment',
      newMonthlyPayment: 'New Monthly Payment',
      monthlySavings: 'Monthly Savings:',
      totalSwitchingCosts: 'Total Switching Costs:',
      breakevenMonth: 'Breakeven Month:',
      neverBreaksEven: 'Never breaks even',
      lifetimeNetSavings: 'Lifetime Net Savings:',
      sensitivityAnalysis: 'Sensitivity Analysis',
      rate: 'Rate',
      breakeven: 'Breakeven (months)',
      lifetimeSavings: 'Lifetime Savings',
      selectTracksToSee: 'Select tracks above to see refinancing analysis',
    },
    recommendations: {
      title: 'Strategic Recommendations',
      priorityRanking: 'Priority Ranking',
      sortedByActionPriority: '(sorted by action priority)',
      riskActionMatrix: 'Risk/Action Matrix',
      track: 'Track',
      recommendedAction: 'Recommended Action',
      confidenceDriver: 'Confidence Driver',
      resetWindow: 'Reset Window',
      penaltyExposure: 'Penalty Exposure',
      ruleEngineReference: 'Rule Engine Reference',
      rule1: 'Pay Off Now:',
      rule1Desc: 'Rate > weighted avg + 0.5% AND zero penalty',
      rule2: 'Wait for Reset:',
      rule2Desc: 'Reset window ≤ 6 months',
      rule3: 'Hold:',
      rule3Desc: 'Penalty ≥ 5% of balance',
      rule4: 'Hold:',
      rule4Desc: 'Default (no strong signal)',
      weightedRate: 'Current weighted rate:',
      payOffNow: 'Pay Off Now',
      waitForReset: 'Wait for Reset',
      hold: 'Hold',
      reason: 'Reason:',

    },
    trackForm: {
      trackType: 'Track Type',
      trackName: 'Track Name',
      principalBalance: 'Principal Balance (₪)',
      annualInterestRate: 'Annual Interest Rate (%)',
      remainingTermMonths: 'Remaining Term (months)',
      monthlyRepayment: 'Monthly Repayment (₪)',
      isPaymentManual: 'Manual Payment Override',
      earlyExitPenalty: 'Early Exit Penalty (₪)',
      noticeFee: 'Notice Fee (₪)',
      monthsToReset: 'Months to Reset',
      isCpiLinked: 'CPI Linked',
      auto: 'Auto',
      editTrack: 'Edit Track',
      addTrack: 'Add Track',
    },
    trackTypes: {
      PRIME: 'Prime',
      FIXED_UNLINKED: 'Fixed Unlinked',
      FIXED_LINKED: 'Fixed Linked',
      VARIABLE_5Y: 'Variable 5Y',
      VARIABLE_5Y_LINKED: 'Variable 5Y Linked',
      OTHER: 'Other',
    },
    emptyState: {
      title: 'No mortgage tracks yet',
      description: 'Add your mortgage tracks to see portfolio diagnostics, early payoff analysis, refinancing breakeven calculations, and personalized recommendations.',
      loadDemoProfile: 'Load Demo Profile',
    },
    validation: {
      required: 'This field is required',
      invalidNumber: 'Please enter a valid number',
      minValue: 'Minimum value is {min}',
      maxValue: 'Maximum value is {max}',
      trackNameRequired: 'Track name is required',
      trackNameMaxLength: 'Track name must be 40 characters or less',
    },
  },
  he: {
    common: {
      appName: 'מנוע החלטות משכנתא',
      manageTracks: 'ניהול מסלולים',
      settings: 'הגדרות',
      save: 'שמור',
      load: 'טען',
      close: 'סגור',
      cancel: 'ביטול',
      confirm: 'אישור',
      delete: 'מחק',
      duplicate: 'שכפל',
      moveUp: 'העלה',
      moveDown: 'הורד',
      addTrack: 'הוסף מסלול',
      noTracks: 'אין מסלולים עדיין',
      loadDemoProfile: 'טען פרופיל דוגמה',
      currency: '₪',
      months: 'חודשים',
      percent: '%',
    },
    header: {
      profile: 'פרופיל:',
    },
    sidebar: {
      profileSummary: 'סיכום פרופיל',
      manageTracks: 'ניהול מסלולים ←',
    },

    kpi: {
      totalOutstandingBalance: 'יתרת חוב כוללת',
      weightedAvgInterestRate: 'שיעור ריבית ממוצע משוקלל',
      blendedMonthlyRepayment: 'החזר חודשי ממוצע',
      estTotalRemainingInterest: 'ריבית כוללת משוערת',
      invalidTracks: 'חלק מהמסלולים בעלי שיעור ריבית לא תקין',
    },
    tabs: {
      portfolio: 'פרופיל ואבחון',
      payoff: 'פרעון מוקדם',
      refinance: 'מיחזור משכנתא',
      recommendations: 'המלצות',
    },
    portfolio: {
      title: 'פרופיל ואבחון',
      balanceDistribution: 'חלוקת יתרה',
      trackDiagnostics: 'אבחון מסלולים',
      name: 'שם',
      type: 'סוג',
      balance: 'יתרה',
      rate: 'שיעור',
      portfolioPercent: '% מהפרופיל',
      monthlyPmt: 'החזר חודשי',
      termLeft: 'תקופה נותרה',
      resetWindow: 'חלון איפוס',
      penalty: 'קנס',
      weightedRateBreakdown: 'פירוט שיעור ממוצד',
      portfolioAvg: 'ממוצע פרופיל:',
      resetTimeline: 'ציר זמן איפוס',
      noResetWindows: 'אין מסלולים עם חלון איפוס',
      resetIn: 'איפוס בעוד',
    },
    payoff: {
      title: 'סימולטור פרעון מוקדם',
      availableLumpSum: 'סכום פדיון זמין (₪):',
      allocation: 'הקצאה',
      mode: 'מצב:',
      reduceTerm: 'קצר תקופה',
      reducePayment: 'הפחת תשלום',
      noticeWaived: 'הודעה מוקדמת 10+ ימים (ללא עמלה)',
      noticeWaivedDescription: 'עמלת הודעה מבוטלת — חוק הודעה מוקדמת (עמלת הודעה מוקדמת) הוחל.',
      suggestOptimalAllocation: 'הצע הקצאה אופטימלית',
      suggestOptimalTooltip: 'מציע הקצאה יעילה, לא בהכרח אופטימלית',
      max: 'מקס:',
      totalAllocated: 'סה"כ הוקצה:',
      remainingToAllocate: 'נותר להקצות',
      resultsByTrack: 'תוצאות לפי מסלול',
      allocated: 'הוקצה',
      interestSaved: 'ריבית שנחסכה',
      penaltyFees: 'קנס ועמלות',
      netBenefit: 'תועלת נטו',
      payoffDiagnostics: 'אבחון פרעון',
      totalPayoffOutlay: 'הוצאה כוללת לפרעון',
      guaranteedInterestSaved: 'ריבית מובטחת שנחסכה',
      monthlyCashflowRelief: 'הקלה בתזרים חודשי',
      disclaimer: 'כתב ויתור:',

      disclaimerText: 'פרעון משכנתא הוא תשואה מובטחת ללא סיכון. תשואות השקעה בשוק אינן מובטחות. השוואה זו אינה לוקחת בחשבון מס הכנסות הון, את סיבולת הסיכון האישית שלך.',
      noticeWaivedNote: 'עמלת הודעה מבוטלת — חוק הודעה מוקדמת (עמלת הודעה מוקדמת) הוחל.',
    },
    refinance: {
      title: 'מנוע איזון מיחזור משכנתא',
      selectTracks: 'בחר מסלולים למיחזור',
      newOfferDetails: 'פרטי הצעה חדשה',
      newRate: 'שיעור חדש (%)',
      newTerm: 'תקופה חדשה (חודשים)',
      otherFees: 'עמלות אחרות (₪)',
      refinancingAnalysis: 'ניתוח מיחזור',
      oldMonthlyPayment: 'החזר חודשי ישן',
      newMonthlyPayment: 'החזר חודשי חדש',
      monthlySavings: 'חיסכון חודשי:',
      totalSwitchingCosts: 'עלויות מיחזור כוללות:',
      breakevenMonth: 'חודש איזון:',
      neverBreaksEven: 'לעולם לא מתאזן',
      lifetimeNetSavings: 'חיסכון נטו לכל החיים:',
      sensitivityAnalysis: 'ניתוח רגישות',
      rate: 'שיעור',
      breakeven: 'איזון (חודשים)',
      lifetimeSavings: 'חיסכון לכל החיים',
      selectTracksToSee: 'בחר מסלולים לעיל כדי לראות ניתוח מיחזור',
    },
    recommendations: {
      title: 'המלצות אסטרטגיות',
      priorityRanking: 'דירוג עדיפות',
      sortedByActionPriority: '(ממוין לפי עדיפות פעולה)',
      riskActionMatrix: 'מטריצת סיכון/פעולה',
      track: 'מסלול',
      recommendedAction: 'פעולה מומלצת',
      confidenceDriver: 'מניע ביטחון',
      resetWindow: 'חלון איפוס',
      penaltyExposure: 'חשיפה לקנס',
      ruleEngineReference: 'הפנייה למנוע כללים',
      rule1: 'פרעון מוקדם:',
      rule1Desc: 'שיעור > ממוצד + 0.5% ואין קנס',
      rule2: 'המתן לאיפוס:',
      rule2Desc: 'חלון איפוס ≤ 6 חודשים',
      rule3: 'החזק:',
      rule3Desc: 'קנס ≥ 5% מהיתרה',
      rule4: 'החזק:',
      rule4Desc: 'ברירת מחדל (ללא אות חזק)',
      weightedRate: 'שיעור ממוצד נוכחי:',
      payOffNow: 'פרעון מוקדם',
      waitForReset: 'המתן לאיפוס',
      hold: 'החזק',
      reason: 'סיבה:',

    },
    trackForm: {
      trackType: 'סוג מסלול',
      trackName: 'שם מסלול',
      principalBalance: 'יתרה עיקרית (₪)',
      annualInterestRate: 'שיעור ריבית שנתי (%)',
      remainingTermMonths: 'תקופה נותרת (חודשים)',
      monthlyRepayment: 'החזר חודשי (₪)',
      isPaymentManual: 'עקיפת תשלום ידנית',
      earlyExitPenalty: 'קנס יציאה מוקדמת (₪)',
      noticeFee: 'עמלת הודעה (₪)',
      monthsToReset: 'חודשים לאיפוס',
      isCpiLinked: 'מקושר למדד',
      auto: 'אוטומטי',
      editTrack: 'ערוך מסלול',
      addTrack: 'הוסף מסלול',
    },
    trackTypes: {
      PRIME: 'פריים',
      FIXED_UNLINKED: 'קבוע לא מקושר',
      FIXED_LINKED: 'קבוע מקושר',
      VARIABLE_5Y: 'משתנה 5 שנים',
      VARIABLE_5Y_LINKED: 'משתנה 5 שנים מקושר',
      OTHER: 'אחר',
    },
    emptyState: {
      title: 'אין מסלולי משכנתא עדיין',
      description: 'הוסף את מסלולי המשכנתא שלך כדי לראות אבחון פרופיל, ניתוח פרעון מוקדם, חישוב איזון מיחזור, והמלצות מותאמות אישית.',
      loadDemoProfile: 'טען פרופיל דוגמה',
    },
    validation: {
      required: 'שדה זה נדרש',
      invalidNumber: 'אנא הכנס מספר תקין',
      minValue: 'ערך מינימלי הוא {min}',
      maxValue: 'ערך מקסימלי הוא {max}',
      trackNameRequired: 'שם מסלול נדרש',
      trackNameMaxLength: 'שם מסלול חייב להיות 40 תווים או פחות',
    },
  },
};

export function useTranslation() {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('language') as Language | null;
    if (saved && (saved === 'en' || saved === 'he')) return saved;
    return 'en'; // Default to English
  });

  const t = translations[language];

  const setLanguageWithRTL = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('language', lang);
    
    // Update document direction
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  };

  // Set initial direction
  useState(() => {
    document.documentElement.dir = language === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  });

  return { t, language, setLanguage: setLanguageWithRTL };
}
