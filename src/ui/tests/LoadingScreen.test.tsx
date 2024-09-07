import React from 'react';
import { render, screen } from '@testing-library/react';
import LoadingScreen, { LoadingTask, setupTasks } from '../LoadingScreen';

describe('LoadingScreen', () => {
	it('should display loading spinner and message when tasks are pending', () => {
		const task = new LoadingTask(() => false, 'Loading data...');
		render(<LoadingScreen tasks={new Set([task])} />);

		expect(screen.getByText('Loading...')).toBeInTheDocument();
		expect(screen.getByText('Loading data...')).toBeInTheDocument();
	});

	it('should hide loading spinner and display children when tasks are completed', () => {
		const task = new LoadingTask(() => true, 'Loading data...');
		render(
			<LoadingScreen tasks={new Set([task])}>
				<div>Content loaded</div>
			</LoadingScreen>
		);

		expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
		expect(screen.queryByText('Loading data...')).not.toBeInTheDocument();
		expect(screen.getByText('Content loaded')).toBeInTheDocument();
	});

	it('should call setup on tasks that are not functions', () => {
		const mockFinishTask = jest.fn();
		const mockTask = {
			then: jest.fn((callback) => callback()),
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

		expect(screen.getByText('Loading data 1...')).toBeInTheDocument();
	});

	it('should update the current message when a task is completed', () => {
		const task1 = new LoadingTask(() => true, 'Loading data 1...');
		const task2 = new LoadingTask(() => false, 'Loading data 2...');
		render(<LoadingScreen tasks={new Set([task1, task2])} />);

		expect(screen.getByText('Loading data 2...')).toBeInTheDocument();
	});
});