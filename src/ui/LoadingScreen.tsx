import React, { useEffect } from 'react';

export type StatusChecker = () => boolean;
export type TaskStatusChecker = Promise<any> | StatusChecker;
export type LoadingTasks = { [key: string]: TaskStatusChecker; };

export interface LoadingScreenProps {
	tasks?: LoadingTasks;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ tasks = {} }) => {
	const [completedTasks, setCompletedTasks] = React.useState(new Set<string>());
	const [pendingTasks, setPendingTasks] = React.useState(new Map<string, TaskStatusChecker>());
	const [currentMessage, setCurrentMessage] = React.useState<string | undefined>(undefined);

	setupTasks(tasks, completedTasks, pendingTasks, setPendingTasks, setCompletedTasks);
	useEffect(() => {
		console.log('Loading Screen', currentMessage, Array.from(pendingTasks.entries()));
		let nextMessage: string | undefined;
		for (const [message, task] of pendingTasks.entries()) {
			if (typeof task === 'function') {
				if (task() && !completedTasks.has(message)) {
					completedTasks.add(message);
				} else {
					nextMessage = message;
					break;
				}
			} else {
				if (!completedTasks.has(message)) {
					nextMessage = message;
					break;
				}
			}
		}
		setCurrentMessage(nextMessage);
	}, [currentMessage, pendingTasks, completedTasks]);
	return (
		<div className="fixed inset-0 flex flex-col justify-center items-center bg-white bg-opacity-90 z-50">
			<div className="border-8 border-gray-200 border-t-blue-500 rounded-full w-16 h-16 animate-spin" />
			<p className="mt-5 text-lg text-gray-800">Loading...</p>
			{currentMessage && <p className="mt-5 text-lg text-gray-800">{currentMessage}</p>}
		</div>
	);
};

export default LoadingScreen;

function setupTasks(tasks: LoadingTasks,
	completedTasks: Set<string>,
	pendingTasks: Map<string, TaskStatusChecker>,
	setPendingTasks: (tasks: Map<string, TaskStatusChecker>) => void,
	setCompletedTasks: (tasks: Set<string>) => void) {
	const newTasks = new Map(pendingTasks);
	for (const [message, task] of Object.entries(tasks)) {
		if (!completedTasks.has(message) && !pendingTasks.has(message)) {
			pendingTasks.set(message, task);
			if (typeof task !== 'function') {
				task.then(() => {
					const nextCompletedTasks = new Set(completedTasks);
					nextCompletedTasks.add(message);
					setCompletedTasks(nextCompletedTasks);
				});
			}
		}
	}
	if (newTasks.size !== pendingTasks.size) {
		setPendingTasks(pendingTasks);
	}
}