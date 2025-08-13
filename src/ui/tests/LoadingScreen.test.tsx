import React from 'react';
import { render, screen, act } from '@testing-library/react';
import LoadingScreen, { LoadingTask, setupTasks } from '../LoadingScreen';

describe('LoadingScreen', () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.runOnlyPendingTimers();
		jest.useRealTimers();
	});
	it('should display loading spinner and message when tasks are pending', () => {
		const task = new LoadingTask(() => false, 'Loading data...');
		render(<LoadingScreen tasks={new Set([task])} />);

		expect(screen.getByText('Loading...')).toBeInTheDocument();
		
		// Advance timers to trigger the polling mechanism
		act(() => {
			jest.advanceTimersByTime(100);
		});
		
		expect(screen.getByText('Loading data...')).toBeInTheDocument();
	});

	it('should hide loading spinner and display children when tasks are completed', () => {
		const task = new LoadingTask(() => true, 'Loading data...');
		render(
			<LoadingScreen tasks={new Set([task])}>
				<div>Content loaded</div>
			</LoadingScreen>
		);

		// Advance timers to trigger task completion polling
		act(() => {
			jest.advanceTimersByTime(100);
		});

		expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
		expect(screen.queryByText('Loading data...')).not.toBeInTheDocument();
		expect(screen.getByText('Content loaded')).toBeInTheDocument();
	});

	it('should call setup on tasks that are not functions', () => {
		const mockFinishTask = jest.fn();
		const mockTask: any = {
			then: jest.fn((callback: () => void): any => {
				callback();
				return mockTask;
			}),
			catch: jest.fn(),
		};
		const task = new LoadingTask(mockTask as unknown as Promise<any>, 'Loading data...');
		setupTasks(new Set([task]), new Set(), mockFinishTask);

		expect(mockTask.then).toHaveBeenCalled();
		expect(mockFinishTask).toHaveBeenCalledWith(task);
	});

	it('should not call setup on tasks that are functions', () => {
		const mockFinishTask = jest.fn();
		const task = new LoadingTask(() => false, 'Loading data...');
		setupTasks(new Set([task]), new Set(), mockFinishTask);

		expect(mockFinishTask).not.toHaveBeenCalled();
	});

	it('should update the current message when a task is pending', () => {
		const task1 = new LoadingTask(() => false, 'Loading data 1...');
		const task2 = new LoadingTask(() => false, 'Loading data 2...');
		render(<LoadingScreen tasks={new Set([task1, task2])} />);

		// Advance timers to trigger polling
		act(() => {
			jest.advanceTimersByTime(100);
		});

		expect(screen.getByText('Loading data 1...')).toBeInTheDocument();
	});

	it('should update the current message when a task is completed', () => {
		const task1 = new LoadingTask(() => true, 'Loading data 1...');
		const task2 = new LoadingTask(() => false, 'Loading data 2...');
		render(<LoadingScreen tasks={new Set([task1, task2])} />);

		// Advance timers to trigger polling and task completion
		act(() => {
			jest.advanceTimersByTime(100);
		});

		expect(screen.getByText('Loading data 2...')).toBeInTheDocument();
	});
});