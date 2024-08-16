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

    it('should show the tooltip on mouse enter', () => {
        const { getByText, getByTestId, getByRole } = render(
            <Tooltip text="Tooltip Text">
                <p data-testid="in-tooltip">stuff</p>
                <button>Button</button>
            </Tooltip>
        );

        fireEvent.mouseEnter(getByRole('tooltip-trigger'));
        tooltipWait();

        expect(getByText('Tooltip Text')).toBeInTheDocument();
    });

    it('should hide the tooltip on mouse leave', async () => {
        const { getByTestId, queryByText } = render(
            <div>
                <p data-testid="outside-tooltip">stuff</p>
                <Tooltip text="Tooltip Text">
                    <p data-testid="in-tooltip">stuff</p>
                </Tooltip>
            </div>
        );

        fireEvent.mouseEnter(getByTestId('in-tooltip'));
        tooltipWait();
        fireEvent.mouseLeave(getByTestId('in-tooltip'));
        tooltipWait();

        expect(queryByText('Tooltip Text')).toBeNull();
    });

    it('should show the tooltip on touch start', () => {
        const { getByText, getByRole } = render(
            <Tooltip text="Tooltip Text">
                <button data-testid="in-tooltip">Button</button>
            </Tooltip>
        );

        fireEvent.mouseEnter(getByRole('tooltip-trigger'));
        tooltipWait();

        expect(getByText('Tooltip Text')).toBeInTheDocument();
    });

    it('should hide the tooltip on touch end', async () => {
        const { getByText, getByTestId, queryByText } = render(
            <Tooltip text="Tooltip Text">
                <button data-testid="in-tooltip">Button</button>
            </Tooltip>
        );

        fireEvent.touchStart(getByTestId('in-tooltip'));
        tooltipWait();
        fireEvent.touchEnd(getByTestId('in-tooltip'));
        tooltipWait();

        expect(queryByText('Tooltip Text')).toBeNull();
    });
});