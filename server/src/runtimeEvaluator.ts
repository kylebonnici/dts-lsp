import { ContextIssues, Issue } from './types';

export class ContextAware {
	private fileMap: string[] = [];
	private issues: Issue<ContextIssues>[] = [];

	// add data in order of importance first file lease important
	public addFile(uri: string) {
		const index = this.fileMap.push(uri);
	}

	public getContextIssue() {}
}
