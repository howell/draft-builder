'use client';

import React from 'react';
import { Card, CardBody } from '@/ui/Card';
import CollapsibleComponent from '@/ui/Collapsible';

/**
 * Plain-language help for the simulator: a collapsed guide card with the big
 * picture, plus the tooltip strings DraftSimulator attaches to individual
 * controls and readouts. All the explanations live here so the page component
 * stays legible.
 */

export const HELP = {
    budget: "Auction dollars per team. Defaults to the league's real budget.",
    teams: "Number of teams. Defaults to the league's real size.",
    stopAtPick: 'How deep a randomized draft runs before stopping.',
    seed: 'Same seed → the same randomized draft, so states are reproducible.',
    elasticity:
        'How strongly per-position prices react to over/under-investment. 0 = every position shares one global inflation factor. "Calibrate elasticity" picks this from your history.',
    noise:
        'Random jitter added to each simulated winning bid, as a fraction of price. Only affects "Randomize to plausible state".',
    positionalValues:
        "Value players on their position's own historical price curve instead of the single overall curve.",
    priors:
        "Blend in this league's historical per-position premium or discount, fading out as real money is spent.",
    expectedUnspent:
        "Subtract the money this league historically leaves unspent at the end of a draft, so it can't inflate mid-draft prices.",
    spent: "Dollars spent so far in the simulated state, out of the league's total pool (budget × teams).",
    globalInflation:
        'Money still to be spent ÷ baseline value still on the board. 1.00 = market tracking the baseline curve. It usually sits above 1.00 on an empty board (older, cheaper seasons pull the baseline down) — watch how it moves as picks come in.',
    positionalInflation:
        'The same inflation split per position, after appetite and priors. Amber = running hotter than the global market.',
    heldOut:
        'held-out: each draft is scored by models fit only on the other selected drafts. in-sample: only one draft is selected, so scores flatter the models.',
    mae: 'Mean absolute error: the average dollar miss per pick. The headline number — lower is better.',
    mape: 'Mean absolute percentage error: the average miss as a percentage of the actual price.',
    bias: 'Signed average miss. Positive = the model over-prices players; negative = under-prices.',
    earlyMae:
        'Dollar miss over the first third of each draft — the expensive picks, where absolute errors are biggest.',
    midMae:
        'Dollar miss over the middle third of each draft — where inflation dynamics (money vs talent remaining) matter most.',
    lateMae: 'Dollar miss over the final third of each draft, where most picks land near $1.',
    trainRegression:
        'Train the legacy 8-feature linear model on the selected seasons and add its column to the explorer and backtest. Changing seasons, budget, or teams discards the trained model.',
} as const;

/** Tooltip text per prediction-explorer column, keyed by predictor id. */
export const MODEL_HELP: Record<string, string> = {
    baseline:
        "Exponential price curve fit on the selected seasons' actual auction prices, by rank. Ignores the live draft entirely — the reference the other models try to beat.",
    'baseline-positional':
        "Per-position price curves fit on the selected seasons' actual auction prices. Ignores the live draft entirely — the reference the other models try to beat.",
    platform:
        "ESPN's own suggested values, rescaled so they sum to this league's total money. \"Just trust the platform\" as a benchmark.",
    inflation:
        'Baseline value × market inflation — how much money is left vs how much talent is left — with per-position appetite controlled by the elasticity slider. This is the model being tuned.',
    regression:
        'Legacy 8-feature linear regression, trained on the selected seasons via the "Train regression" button. The column only exists while a trained model matches the current seasons and league config.',
};

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 className="font-semibold text-gray-800 dark:text-gray-200">{children}</h3>
);

const Term: React.FC<{ name: string; children: React.ReactNode }> = ({ name, children }) => (
    <li>
        <span className="font-medium text-gray-800 dark:text-gray-200">{name}</span> — {children}
    </li>
);

const SimulatorGuide: React.FC = () => (
    <Card>
        <CardBody>
            <CollapsibleComponent
                label={
                    <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                        How this page works
                    </h2>
                }
                testId="simulator-guide-toggle"
            >
                <div className="mt-3 space-y-4 text-sm text-gray-600 dark:text-gray-300">
                    <p>
                        This page tunes and evaluates auction price models against this league&apos;s
                        real draft history, so you know which model (and which settings) to trust on
                        draft day. Nothing here changes your league data — it&apos;s a sandbox.
                    </p>

                    <div>
                        <SectionTitle>Suggested workflow</SectionTitle>
                        <ol className="list-decimal ml-5 mt-1 space-y-1">
                            <li>Pick which seasons feed the models (History seasons).</li>
                            <li>
                                Run backtest — replays every selected draft pick-by-pick and scores
                                each model&apos;s predictions against the real prices.
                            </li>
                            <li>Calibrate elasticity — finds the best slider value and applies it.</li>
                            <li>
                                Toggle a model knob, re-run the backtest, and keep the knob only if
                                it lowers the held-out MAE.
                            </li>
                            <li>
                                Randomize to plausible state — fakes a mid-draft so you can eyeball
                                what each model would say at that point.
                            </li>
                        </ol>
                    </div>

                    <div>
                        <SectionTitle>The price models (explorer columns)</SectionTitle>
                        <ul className="list-disc ml-5 mt-1 space-y-1">
                            <Term name="Baseline">
                                a price curve fit on the selected seasons&apos; actual auction prices,
                                by rank. Ignores the live draft — the reference everything else tries
                                to beat.
                            </Term>
                            <Term name="Platform">
                                ESPN&apos;s own player values, rescaled so they sum to this
                                league&apos;s total money. &quot;Just trust ESPN&quot; as a benchmark
                                — expect it to disagree with Baseline wherever this league&apos;s
                                history disagrees with ESPN&apos;s valuations.
                            </Term>
                            <Term name="Inflation">
                                Baseline × market inflation (money left vs talent left), with
                                per-position appetite set by the elasticity slider. This is the model
                                being tuned.
                            </Term>
                            <Term name="Regression">
                                the older 8-feature linear model. Opt-in: its column only appears
                                after you press &quot;Train regression&quot;, and it disappears again
                                if you change the seasons, budget, or team count (retrain to bring
                                it back).
                            </Term>
                        </ul>
                    </div>

                    <div>
                        <SectionTitle>Reading the inflation numbers</SectionTitle>
                        <p className="mt-1">
                            Global inflation is money still to be spent ÷ baseline value still on the
                            board: 1.00 means the market is tracking the baseline curve, 1.20 means
                            remaining players should go ~20% over it. It usually starts above 1.00 on
                            an empty board — older, cheaper seasons pull the baseline curve down —
                            so its <em>movement</em> as picks come in is more informative than its
                            starting level. The positional badges split the same money by position;
                            amber means that position is running hotter than the global market.
                        </p>
                    </div>

                    <div>
                        <SectionTitle>Reading the backtest table</SectionTitle>
                        <ul className="list-disc ml-5 mt-1 space-y-1">
                            <Term name="MAE">average dollar miss per pick — the headline score, lower is better.</Term>
                            <Term name="MAPE">the same miss as a percentage of the actual price.</Term>
                            <Term name="Bias">
                                signed miss: positive means the model systematically over-prices.
                            </Term>
                            <Term name="Early / Mid / Late MAE">
                                the miss split by draft phase (thirds of each draft). Early is where
                                absolute errors are biggest; mid is where inflation dynamics matter
                                most; late picks mostly land near $1.
                            </Term>
                            <Term name="held-out badge">
                                each draft was scored by models fit on the <em>other</em> drafts — the
                                honest setting. &quot;in-sample&quot; means only one draft was
                                available, so scores flatter the models.
                            </Term>
                        </ul>
                    </div>
                </div>
            </CollapsibleComponent>
        </CardBody>
    </Card>
);

export default SimulatorGuide;
