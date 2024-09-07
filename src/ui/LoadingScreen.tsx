import React, { useCallback, useEffect, useState } from 'react';

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
		return false;
	}

	public setup(finishTask: (task: LoadingTask) => void): void {
		if (typeof this.task !== 'function') {
			this.task.then(() => finishTask(this));
		}
	}

	public equals(other: LoadingTask): boolean {
		return this.id === other?.id;
	}

	public hashCode(): number {
		return this.id;
	}
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ tasks = new Set(), children }) => {
	const [completedTasks, setCompletedTasks] = useState(new Set<LoadingTask>());
	const [pendingTasks, setPendingTasks] = useState(new Set(tasks));
	const [currentMessage, setCurrentMessage] = useState<string | undefined>(undefined);
	const [loading, setLoading] = useState(true);


	const finishTask = useCallback((task: LoadingTask) => {
		if (completedTasks.has(task)) return;
		const newCompletedTasks = new Set(completedTasks);
		newCompletedTasks.add(task);
		setCompletedTasks(newCompletedTasks);
		const newPendingTasks = new Set(pendingTasks);
		newPendingTasks.delete(task);
		setPendingTasks(newPendingTasks);
	}, [pendingTasks, setPendingTasks, completedTasks, setCompletedTasks]);

	useEffect(() => {
		setupTasks(tasks, completedTasks, finishTask);
		const newPendingTasks = new Set(pendingTasks);
		for (const task of tasks) {
			if (!completedTasks.has(task)) {
				newPendingTasks.add(task);
			}
		}
		if (newPendingTasks.size !== pendingTasks.size) {
			setPendingTasks(newPendingTasks);
		}
	}, [tasks, pendingTasks, completedTasks, finishTask]);

	useEffect(() => {
		let nextMessage: string | undefined;
		for (const task of pendingTasks) {
			if (task.isFinished()) {
				finishTask(task);
			} else {
				nextMessage = task.message;
				break;
			}
		}
		if (nextMessage !== currentMessage) {
			setCurrentMessage(nextMessage);
		}
	}, [currentMessage, pendingTasks, completedTasks, finishTask]);
	
	useEffect(() => {
		setLoading(pendingTasks.size !== 0);
	}, [pendingTasks]);
	return (
		<span>
			{loading &&
				<span className={loading ? '' : 'hidden'}>
					<div className="fixed inset-0 flex flex-col justify-center items-center bg-white bg-opacity-90 z-50">
						<div className="border-8 border-gray-200 border-t-blue-500 rounded-full w-16 h-16 animate-spin" />
						<p className="mt-5 text-lg text-gray-800">Loading...</p>
						{currentMessage && <p className="mt-5 text-lg text-gray-800">{currentMessage}</p>}
					</div>
				</span>
			}
			<span className={loading ? 'hidden' : ''}>
				{children}
			</span>
		</span>
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