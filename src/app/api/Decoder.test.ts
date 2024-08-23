import { Decoder, DecoderWithResult, FailedDecoder, DecodeFailure } from "./Decoder";

describe("Decoder", () => {
    it("should decode a valid value", () => {
        const key = "name";
        const value = "John";
        const pred = (v: any): v is string => typeof v === "string";

        const params = new URLSearchParams({ [key]: JSON.stringify(value) });
        const result = Decoder.create(params)
            .decode(key, pred).finalize();

        expect(result).toEqual({ [key]: value });
    });

    it("should not decode an invalid value", () => {
        const key = "age";
        const value = "25";
        const pred = (v: any): v is number => typeof v === "number";

        const params = new URLSearchParams({ [key]: JSON.stringify(value) });
        const result = Decoder.create(params)
            .decode(key, pred).finalize();

        expect(result).toBeInstanceOf(DecodeFailure);
        const failure = result as DecodeFailure;
        expect(failure.getParams()).toBeInstanceOf(URLSearchParams);
        expect(failure.getKey()).toBe(key);
    });

    it("should handle multiple decodes", () => {
        const key1 = "name";
        const value1 = "John";
        const pred1 = (v: any): v is string => typeof v === "string";

        const key2 = "age";
        const value2 = 25;
        const pred2 = (v: any): v is number => typeof v === "number";

        const params = new URLSearchParams({ [key1]: JSON.stringify(value1), [key2]: JSON.stringify(value2) });
        const result = Decoder.create(params)
            .decode(key1, pred1)
            .decode(key2, pred2)
            .finalize();

        expect(result).toEqual({ [key1]: value1, [key2]: value2 });
    });
});