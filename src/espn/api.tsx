
export const baseURL = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/';

export function buildRoute(route: any, params: any) : string{
    return `${baseURL}${route}${params}`;
}
