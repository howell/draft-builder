
export abstract class Decoder<T> {
    public static create(params: URLSearchParams): Decoder<{}> {
        return new DecoderWithResult(params, {});
    }

    protected params: URLSearchParams;

    constructor(params: URLSearchParams) {
        this.params = params;
    }

    public abstract decode<K extends string, V>(key: K, pred: (v: any) => v is V): Decoder<T & {
        [P in K]: V;
    }>;

    public abstract finalize(): T | DecodeFailure;
}
export class DecoderWithResult<T> extends Decoder<T> {
    private resultSoFar: T = {} as T;

    constructor(params: URLSearchParams, resultSoFar: T) {
        super(params);
        this.resultSoFar = resultSoFar;
    }

    public decode<K extends string, V>(key: K, pred: (v: any) => v is V): Decoder<T & {
        [P in K]: V;
    }> {
        if (this.params.has(key)) {
            const value = JSON.parse(this.params.get(key) ?? '');
            if (pred(value)) {
                return new DecoderWithResult(this.params, { ...this.resultSoFar, [key]: value } as T & {
                    [P in K]: V;
                });
            }
        }
        return new FailedDecoder(this.params, key);
    }

    public finalize(): T {
        return this.resultSoFar;
    }

}

export class FailedDecoder<T> extends Decoder<T> {
    private key: string;

    constructor(params: URLSearchParams, key: string) {
        super(params);
        this.key = key;
    }

    public decode<K extends string, V>(key: K, pred: (v: any) => v is V): Decoder<T & {
        [P in K]: V;
    }> {
        return this as Decoder<T & {
            [P in K]: V;
        }>;
    }

    public finalize(): T | DecodeFailure {
        return new DecodeFailure(this.params, this.key);
    }
}

export class DecodeFailure {
    private params: URLSearchParams;
    private key: string;

    constructor(params: URLSearchParams, key: string) {
        this.params = params;
        this.key = key;
    }

    public getParams(): URLSearchParams {
        return this.params;
    }

    public getKey(): string {
        return this.key;
    }
}

