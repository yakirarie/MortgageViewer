# Mashkanta Decision Engine

A single-page React application for Israeli mortgage holders (mashkanta) to analyze their mortgage portfolio, simulate early payoff scenarios, evaluate refinancing offers, and get personalized recommendations.

## Features

- **Portfolio Diagnostics**: View balance distribution, weighted interest rates, and reset timelines across multiple mortgage tracks
- **Early Payoff Simulator**: Calculate net payoff benefit (NPB) for lump sum allocations, compare against investment alternatives
- **Refinancing Breakeven Engine**: Analyze refinancing offers with breakeven calculations and sensitivity analysis
- **Strategic Recommendations**: Rule-based recommendations per track (pay off now, wait for reset, consider refinancing, or hold)
- **Track Management**: Full CRUD for mortgage tracks with validation and auto-calculation
- **Theme Support**: Dark and light theme toggle with persistence
- **Data Privacy**: All data stays client-side; JSON export/import for backup

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Vitest** - Testing

## Project Structure

```
src/
├── components/       # React components
│   ├── tabs/          # Tab-specific components
│   ├── Header.tsx
│   ├── Sidebar.tsx
│   ├── KpiRow.tsx
│   ├── TabBar.tsx
│   ├── EmptyState.tsx
│   ├── ProfileManager.tsx
│   ├── TrackCard.tsx
│   └── TrackForm.tsx
├── hooks/            # Custom React hooks
│   ├── useProfile.ts
│   └── useTheme.ts
├── lib/              # Core business logic
│   ├── types.ts        # TypeScript type definitions
│   ├── mortgage-math.ts # Math engine (PRD §4)
│   ├── validation.ts    # Validation utilities
│   ├── demo-profile.ts  # Demo profile helpers
│   └── utils.ts        # Utility functions
├── App.tsx            # Main application component
├── main.tsx           # Application entry point
└── index.css          # Global styles with CSS variables
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build

```bash
npm run build
```

The production build will be in the `dist/` directory.

### Testing

```bash
npm test
```

## Math Engine

The core math engine implements all formulas from the PRD §4:

- **Weighted Average Rate**: Portfolio-weighted interest rate calculation
- **Spitzer Payment**: French amortization formula for monthly payments
- **Total Remaining Interest**: Calculation of remaining interest over term
- **Net Payoff Benefit (NPB)**: Interest saved minus penalties and fees for early payoff
- **Optimal Allocation**: Greedy allocation to highest-impact tracks
- **Investment Comparison**: Compound growth comparison against mortgage payoff
- **Refinancing Breakeven**: Month when refinancing becomes profitable
- **Recommendation Engine**: Rule-based track recommendations

All math functions are pure, side-effect-free, and gracefully handle zero/missing inputs.

## Data Model

### Track (Mortgage Track)

A single mortgage track with the following fields:

- `track_id`: Unique identifier
- `custom_name`: User-friendly name
- `track_type`: Type (PRIME, FIXED_UNLINKED, FIXED_LINKED, VARIABLE_5Y, VARIABLE_5Y_LINKED, OTHER)
- `principal_balance`: Outstanding balance in ₪
- `annual_interest_rate`: Annual interest rate (decimal, e.g., 0.055 = 5.5%)
- `remaining_term_months`: Remaining term in months
- `monthly_repayment`: Monthly payment (auto-calculated or manual override)
- `is_payment_manual_override`: Whether payment is manually set
- `early_exit_penalty`: Early exit penalty (Amlat Pirachon)
- `notice_fee`: Notice fee (Amlat Hoda'a Mukdamet)
- `months_to_reset`: Months until reset window (null for fixed types)
- `is_cpi_linked`: Whether balance is CPI-linked

### Profile

A profile contains:

- `schema_version`: Schema version (currently 1)
- `profile_name`: User-defined profile name
- `created_at`: ISO timestamp
- `global_assumptions`: Market rate, investment return, prime rate
- `tracks`: Array of Track objects (max 8)

## Usage

1. **Load Demo Profile**: Click "Load Demo Profile" to see a realistic 4-track Israeli mortgage
2. **Add Your Own Tracks**: Click "Manage Tracks" to add your mortgage tracks manually
3. **Set Global Assumptions**: Configure market rate, investment return, and prime rate in the sidebar
4. **Analyze**: Use the four tabs to analyze your mortgage:
   - **Portfolio & Diagnostics**: Overview of your current portfolio
   - **Early Payoff**: Simulate lump sum payoff scenarios
   - **Refinancing**: Evaluate refinancing offers
   - **Recommendations**: Get personalized action recommendations

## Design System

The app uses a CSS variable-based theme system with two themes:

- **Dark theme** (default): Dark backgrounds, light text, green accent for positive gains
- **Light theme**: Light backgrounds, dark text, green accent for positive gains

Colors are consistent across themes with appropriate contrast ratios for accessibility.

## Validation

All fields are validated on blur (not keystroke) per PRD §5.3:

- Currency fields: Must be ≥ 0
- Percentage fields: 0% to 15% (warn if > 8%)
- Term fields: 1 to 360 months
- Track name: 1-40 characters, non-empty
- Track type: Must be one of the enum values

## Scope Limitations

Per the PRD, the following are explicitly out of scope for v1:

- CPI drift projection for CPI-linked tracks (shown with disclaimer)
- Exact BOI penalty calculation (simplified estimate with disclaimer)
- Mobile-first layout (desktop/tablet-first, responsively degradable)
- Multi-user auth or backend persistence
- Bank API integration
- Day-count precision (monthly granularity only)

## License

MIT

## Acknowledgments

Built according to the Mashkanta Decision Engine PRD v1.0, targeting Israeli mortgage holders with Hebrew-inflected banking vocabulary (Prime, Klatz, Mirzur, Amlat Pirachon, etc.).
