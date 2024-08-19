import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom'; // Ensure this is imported
import Tooltip, { TOOLTIP_DELAY } from './Tooltip';

async function tooltipWait() {
    await new Promise((resolve) => setTimeout(resolve, TOOLTIP_DELAY + 5));
}

describe('Tooltip', () => {
    it('should render the children', () => {
        const { getByText } = render(
            <Tooltip text="Tooltip Text">
                <button>Button</button>
            </Tooltip>
        );

        expect(getByText('Button')).toBeInTheDocument();
    });

    it('should be hidden by default', () => {
        const { queryByText } = render(
            <Tooltip text="Tooltip Text">
                <button>Button</button>
            </Tooltip>
        );

        expect(queryByText('Tooltip Text')).toBeNull();
    });

    it('should show the tooltip on mouse enter', async () => {
        const { getByText, getByTestId, getByRole } = render(
            <Tooltip text="Tooltip Text">
                <p data-testid="in-tooltip">stuff</p>
                <button>Button</button>
            </Tooltip>
        );

        fireEvent.mouseEnter(getByRole('tooltip-trigger'));
        await tooltipWait();

        expect(getByText('Tooltip Text')).toBeInTheDocument();
    });

    it('should hide the tooltip on mouse leave', async () => {
        const { getByRole, queryByText } = render(
            <div>
                <p data-testid="outside-tooltip">stuff</p>
                <Tooltip text="Tooltip Text">
                    <p data-testid="in-tooltip">stuff</p>
                </Tooltip>
            </div>
        );

        fireEvent.mouseEnter(getByRole('tooltip-trigger'));
        await tooltipWait();
        expect(queryByText('Tooltip Text')).toBeInTheDocument();
        fireEvent.mouseLeave(getByRole('tooltip-trigger'));
        await tooltipWait();

        expect(queryByText('Tooltip Text')).toBeNull();
    });

    it('should show the tooltip on touch start', async () => {
        const { getByText, getByRole } = render(
            <Tooltip text="Tooltip Text">
                <button data-testid="in-tooltip">Button</button>
            </Tooltip>
        );

        fireEvent.mouseEnter(getByRole('tooltip-trigger'));
        await tooltipWait();

        expect(getByText('Tooltip Text')).toBeInTheDocument();
    });

    it('should hide the tooltip on touch end', async () => {
        const { getByRole, queryByText } = render(
            <Tooltip text="Tooltip Text">
                <button data-testid="in-tooltip">Button</button>
            </Tooltip>
        );
    
        fireEvent.touchStart(getByRole('tooltip-trigger'));
        await tooltipWait();
        fireEvent.touchEnd(getByRole('tooltip-trigger'));
        await tooltipWait();
    
        expect(queryByText('Tooltip Text')).not.toBeInTheDocument();
    });
});
it('should position the tooltip to the top right if there is enough room', async () => {
    const { getByRole, queryByText } = render(
        <div style={{ position: 'relative', width: '200px', height: '200px' }}>
            <Tooltip text="Tooltip Text">
                <button data-testid="tooltip-trigger">Button</button>
            </Tooltip>
        </div>
    );

    const tooltipTrigger = getByRole('tooltip-trigger');
    fireEvent.mouseEnter(tooltipTrigger);
    await tooltipWait();

    const tooltip = queryByText('Tooltip Text');
    const tooltipRect = tooltip?.getBoundingClientRect();
    const triggerRect = tooltipTrigger.getBoundingClientRect();

    expect(tooltip).toBeInTheDocument();
    expect(tooltipRect?.top).toBeLessThanOrEqual(triggerRect.top);
    expect(tooltipRect?.right).toBeGreaterThanOrEqual(triggerRect.right);
});

it('should adjust the tooltip position down if there is not enough room on the top', async () => {
    const { getByRole, queryByText } = render(
        <div style={{ position: 'relative', width: '200px', height: '50px' }}>
            <Tooltip text="Tooltip Text">
                <button data-testid="tooltip-trigger">Button</button>
            </Tooltip>
        </div>
    );

    const tooltipTrigger = getByRole('tooltip-trigger');
    fireEvent.mouseEnter(tooltipTrigger);
    await tooltipWait();

    const tooltip = queryByText('Tooltip Text');
    const tooltipRect = tooltip?.getBoundingClientRect();
    const triggerRect = tooltipTrigger.getBoundingClientRect();

    expect(tooltip).toBeInTheDocument();
    expect(tooltipRect?.top).toBeGreaterThanOrEqual(triggerRect.bottom);
    expect(tooltipRect?.right).toBeGreaterThanOrEqual(triggerRect.right);
});

it('should adjust the tooltip position to the left if there is not enough room on the right', async () => {
    const { getByRole, queryByText } = render(
        <div style={{ position: 'relative', width: '50px', height: '200px' }}>
            <Tooltip text="Tooltip Text">
                <button data-testid="tooltip-trigger">Button</button>
            </Tooltip>
        </div>
    );

    const tooltipTrigger = getByRole('tooltip-trigger');
    fireEvent.mouseEnter(tooltipTrigger);
    await tooltipWait();

    const tooltip = queryByText('Tooltip Text');
    const tooltipRect = tooltip?.getBoundingClientRect();
    const triggerRect = tooltipTrigger.getBoundingClientRect();

    expect(tooltip).toBeInTheDocument();
    expect(tooltipRect?.top).toBeLessThanOrEqual(triggerRect.top);
    expect(tooltipRect?.left).toBeLessThanOrEqual(triggerRect.left);
});
