import React, { useCallback, useEffect, useState } from 'react';
import { UseQueryResult } from '@tanstack/react-query';

export type StatusChecker = () => boolean;
export type TaskStatusChecker = Promise<any> | StatusChecker;
export type LoadingTasks = Set<LoadingTask>;

export interface LoadingScreenProps {
	tasks?: LoadingTasks;
	children?: React.ReactNode;
}

export class LoadingTask {
	private task: TaskStatusChecker;
	private id: number;
	public message: string;
	private finished: boolean = false;
	private error: Error | null = null;

	private static nextId = 0;

	constructor(task: TaskStatusChecker, message: string) {
		this.id = LoadingTask.nextId++;
		this.task = task;
		this.message = message;
	}

	public isFinished(): boolean {
		if (typeof this.task === 'function') {
			return this.task();
		}
		return this.finished;
	}

	public hasError(): boolean {
		return this.error !== null;
	}

	public getError(): Error | null {
		return this.error;
	}

	public setup(finishTask: (task: LoadingTask) => void): void {
		if (typeof this.task !== 'function') {
			this.task
				.then(() => {
					this.finished = true;
					finishTask(this);
				})
				.catch((error) => {
					this.error = error;
					this.finished = true;
					finishTask(this);
				});
		}
	}

	public equals(other: LoadingTask): boolean {
		return this.id === other?.id;
	}

	public hashCode(): number {
		return this.id;
	}
}

export class QueryLoadingTask extends LoadingTask {
	private query: UseQueryResult<any>;
	private static queryTaskId = 0;

	constructor(query: UseQueryResult<any>, message: string) {
		// Use a status checker function instead of promise/task
		super(() => query.isSuccess || query.isError, message);
		this.query = query;
		// Override the id to distinguish from regular LoadingTask
		(this as any).id = -(QueryLoadingTask.queryTaskId++); // Negative IDs for query tasks
	}

	public isFinished(): boolean {
		return this.query.isSuccess || this.query.isError;
	}

	public hasError(): boolean {
		return this.query.isError;
	}

	public getError(): Error | null {
		return this.query.error as Error | null;
	}

	// Query tasks don't need setup since they're already managed by React Query
	public setup(finishTask: (task: LoadingTask) => void): void {
		// No-op for query tasks - React Query manages the lifecycle
	}
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ tasks = new Set(), children }) => {
	const [completedTasks, setCompletedTasks] = useState(new Set<LoadingTask>());
	const [currentMessage, setCurrentMessage] = useState<string | undefined>(undefined);
	const [loading, setLoading] = useState(true);

	// Derive pending tasks from props and completed state
	const pendingTasks = React.useMemo(() => {
		const pending = new Set<LoadingTask>();
		for (const task of tasks) {
			if (!completedTasks.has(task)) {
				pending.add(task);
			}
		}
		return pending;
	}, [tasks, completedTasks]);

	// Simplified finish task that only updates completed tasks
	const finishTask = useCallback((task: LoadingTask) => {
		setCompletedTasks(prev => {
			if (prev.has(task)) return prev;
			const newCompleted = new Set(prev);
			newCompleted.add(task);
			return newCompleted;
		});
	}, []);

	// Setup tasks when they change
	useEffect(() => {
		setupTasks(tasks, completedTasks, finishTask);
	}, [tasks, completedTasks, finishTask]);

	// Poll for finished tasks
	useEffect(() => {
		const interval = setInterval(() => {
			let allComplete = true;
			let nextMessage: string | undefined;
			
			for (const task of pendingTasks) {
				if (task.isFinished()) {
					finishTask(task);
				} else {
					allComplete = false;
					nextMessage = task.message;
					break;
				}
			}
			
			setCurrentMessage(nextMessage);
			
			// CRITICAL FIX: Stop polling when all tasks complete
			if (allComplete && pendingTasks.size === 0) {
				console.log('[LoadingScreen] All tasks complete, stopping polling');
				clearInterval(interval);
			}
		}, 100);
		
		return () => clearInterval(interval);
	}, [pendingTasks, finishTask]);
	
	// Update loading state based on pending tasks
	useEffect(() => {
		setLoading(pendingTasks.size > 0);
	}, [pendingTasks]);
	return (
		<div>
			{loading && (
				<div 
					className="fixed inset-0 flex flex-col justify-center items-center bg-white bg-opacity-90 z-50"
					role="dialog"
					aria-modal="true"
					aria-labelledby="loading-title"
					aria-describedby="loading-message"
				>
					<div 
						className="border-8 border-gray-200 border-t-blue-500 rounded-full w-16 h-16 animate-spin"
						role="status"
						aria-hidden="true"
					/>
					<h2 id="loading-title" className="mt-5 text-lg text-gray-800 font-medium">
						Loading...
					</h2>
					{currentMessage && (
						<p 
							id="loading-message" 
							className="mt-2 text-sm text-gray-600 text-center max-w-md"
							aria-live="polite"
							aria-atomic="true"
						>
							{currentMessage}
						</p>
					)}
				</div>
			)}
			<div className={loading ? 'sr-only' : ''} aria-hidden={loading}>
				{children}
			</div>
		</div>
	);
};

export default LoadingScreen;

export function setupTasks(tasks: LoadingTasks, completedTasks: Set<LoadingTask>, finishTask: (task: LoadingTask) => void) {
	for (const task of tasks) {
		if (!completedTasks.has(task)) {
			task.setup(finishTask);
		}
	}
}