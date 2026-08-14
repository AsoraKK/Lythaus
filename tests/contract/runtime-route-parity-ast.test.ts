import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type WorkerName = 'public' | 'admin';

interface RuntimeRoute {
  method: HttpMethod;
  path: string;
  worker: WorkerName;
}

interface ExtractedWorkerRoutes {
  routes: RuntimeRoute[];
  startsWithPrefixes: string[];
  unrecognizedDispatcherBranches: string[];
  unrecognizedPathnameSyntax: string[];
}

const root = process.cwd();
const contract = JSON.parse(
  fs.readFileSync(path.join(root, 'api/openapi/dist/openapi.json'), 'utf8'),
);
const methodNames = new Set<HttpMethod>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const internalRouteKeys = new Set([
  'GET /health',
  'GET /ready',
  'GET /internal/readiness/database-identity',
]);
const intentionalStartsWithPrefixes = new Set([
  '/api/auth/email/verify',
  '/api/auth/password/reset',
  '/api/federation',
  '/api/payments',
  '/api/video',
]);
const intentionalDirectPathnameUses = new Set(['rateLimitPlan(url.pathname)']);

function propertyText(node: ts.Node): string {
  return node.getText().replace(/\s/g, '');
}

function expandRuntimePattern(pattern: string): string[] {
  let values = [pattern.replace(/^\^/, '').replace(/\$$/, '').replace(/\\\//g, '/')];
  for (;;) {
    const match = values[0]?.match(/\((?:\?:)?([A-Za-z0-9_-]+(?:\|[A-Za-z0-9_-]+)+)\)/);
    if (!match) break;
    const choices = match[1].split('|');
    values = values.flatMap((value) => choices.map((choice) => value.replace(match[0], choice)));
  }
  return values.map((value) => value
    .replace(/\(\[\^\/\]\+\)/g, '{param}')
    .replace(/\\([.{}])/g, '$1'));
}

function regexPaths(node: ts.Expression | undefined): string[] {
  if (!node || !ts.isRegularExpressionLiteral(node)) return [];
  const text = node.getText();
  const lastSlash = text.lastIndexOf('/');
  return expandRuntimePattern(text.slice(1, lastSlash));
}

function isPathname(node: ts.Node): boolean {
  return propertyText(node) === 'url.pathname';
}

function isRequestMethod(node: ts.Node): boolean {
  return propertyText(node) === 'request.method';
}

function pathnameMatchPaths(node: ts.Node | undefined): string[] {
  if (!node || !ts.isCallExpression(node) || node.arguments.length !== 1) return [];
  if (!ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== 'match') return [];
  if (!isPathname(node.expression.expression)) return [];
  return regexPaths(node.arguments[0]);
}

function collectVariablePatterns(sourceFile: ts.Node): Map<string, string[]> {
  const patterns = new Map<string, string[]>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const paths = pathnameMatchPaths(node.initializer as ts.Expression | undefined);
      if (paths.length > 0) patterns.set(node.name.text, paths);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return patterns;
}

function defaultFetchBody(sourceFile: ts.SourceFile): ts.Block {
  const exportAssignment = sourceFile.statements.find(ts.isExportAssignment);
  if (!exportAssignment || !ts.isObjectLiteralExpression(exportAssignment.expression)) {
    throw new Error(`default_export_object_required:${sourceFile.fileName}`);
  }
  const fetchMethod = exportAssignment.expression.properties.find((property) =>
    ts.isMethodDeclaration(property)
    && ((ts.isIdentifier(property.name) && property.name.text === 'fetch')
      || (ts.isStringLiteral(property.name) && property.name.text === 'fetch')),
  );
  if (!fetchMethod || !ts.isMethodDeclaration(fetchMethod) || !fetchMethod.body) {
    throw new Error(`default_export_fetch_required:${sourceFile.fileName}`);
  }
  return fetchMethod.body;
}

function pathnameSyntaxDiagnostics(
  fetchBody: ts.Block,
  variablePatterns: Map<string, string[]>,
): Pick<ExtractedWorkerRoutes, 'startsWithPrefixes' | 'unrecognizedDispatcherBranches' | 'unrecognizedPathnameSyntax'> {
  const startsWithPrefixes: string[] = [];
  const unrecognizedDispatcherBranches: string[] = [];
  const unrecognizedPathnameSyntax: string[] = [];
  const visit = (node: ts.Node): void => {
    if (isPathname(node)) {
      const parent = node.parent;
      const compared = ts.isBinaryExpression(parent)
        && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken].includes(parent.operatorToken.kind);
      const methodCall = ts.isPropertyAccessExpression(parent)
        && ['match', 'startsWith'].includes(parent.name.text)
        && ts.isCallExpression(parent.parent)
        && parent.parent.expression === parent;
      if (methodCall && parent.name.text === 'startsWith') {
        const argument = (parent.parent as ts.CallExpression).arguments[0];
        if (argument && ts.isStringLiteral(argument)) startsWithPrefixes.push(argument.text);
        else unrecognizedPathnameSyntax.push(parent.parent.getText());
      } else if (!compared && !methodCall) {
        unrecognizedPathnameSyntax.push(parent.getText());
      }
    }
    if (ts.isIfStatement(node)) {
      const text = node.expression.getText();
      const mentionsPath = text.includes('url.pathname')
        || Array.from(variablePatterns.keys()).some((name) => new RegExp(`\\b${name}\\b`).test(text));
      const mentionsMethod = text.includes('request.method');
      if (mentionsPath && mentionsMethod
        && (conditionPaths(node.expression, variablePatterns).length === 0
          || conditionMethods(node.expression).length === 0)) {
        unrecognizedDispatcherBranches.push(text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(fetchBody);
  return {
    startsWithPrefixes: Array.from(new Set(startsWithPrefixes)).sort(),
    unrecognizedDispatcherBranches: Array.from(new Set(unrecognizedDispatcherBranches)).sort(),
    unrecognizedPathnameSyntax: Array.from(new Set(unrecognizedPathnameSyntax)).sort(),
  };
}

function stringsComparedWith(
  condition: ts.Node,
  predicate: (node: ts.Node) => boolean,
): string[] {
  const values: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node)
      && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken].includes(node.operatorToken.kind)) {
      if (predicate(node.left) && ts.isStringLiteral(node.right)) values.push(node.right.text);
      if (predicate(node.right) && ts.isStringLiteral(node.left)) values.push(node.left.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(condition);
  return values;
}

function arrayIncludedMethods(condition: ts.Node): HttpMethod[] {
  const methods: HttpMethod[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)
      && node.arguments.length === 1
      && isRequestMethod(node.arguments[0])
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'includes'
      && ts.isArrayLiteralExpression(node.expression.expression)) {
      for (const element of node.expression.expression.elements) {
        if (ts.isStringLiteral(element) && methodNames.has(element.text as HttpMethod)) {
          methods.push(element.text as HttpMethod);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(condition);
  return methods;
}

function conditionMethods(condition: ts.Node): HttpMethod[] {
  return Array.from(new Set([
    ...stringsComparedWith(condition, isRequestMethod)
      .filter((value): value is HttpMethod => methodNames.has(value as HttpMethod)),
    ...arrayIncludedMethods(condition),
  ]));
}

function conditionPaths(condition: ts.Node, variablePatterns: Map<string, string[]>): string[] {
  const values = stringsComparedWith(condition, isPathname).filter((value) => value.startsWith('/'));
  const visit = (node: ts.Node): void => {
    values.push(...pathnameMatchPaths(node));
    if (ts.isIdentifier(node)) values.push(...(variablePatterns.get(node.text) ?? []));
    ts.forEachChild(node, visit);
  };
  visit(condition);
  return Array.from(new Set(values));
}

function canonicalPath(value: string): string {
  const withoutApiPrefix = value.startsWith('/api/') ? value.slice(4) : value;
  return withoutApiPrefix.replace(/\{[^}]+\}/g, '{param}');
}

function extractRoutesFromSource(worker: WorkerName, source: string, relativePath: string): ExtractedWorkerRoutes {
  const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true);
  const fetchBody = defaultFetchBody(sourceFile);
  const variablePatterns = collectVariablePatterns(fetchBody);
  const routes: RuntimeRoute[] = [];

  const visit = (
    node: ts.Node,
    inheritedPaths: string[] = [],
    inheritedMethods: HttpMethod[] = [],
  ): void => {
    if (ts.isIfStatement(node)) {
      const ownPaths = conditionPaths(node.expression, variablePatterns);
      const ownMethods = conditionMethods(node.expression);
      const paths = ownPaths.length > 0 ? ownPaths : inheritedPaths;
      const methods = ownMethods.length > 0 ? ownMethods : inheritedMethods;
      for (const routePath of paths) {
        for (const method of methods) {
          routes.push({ worker, method, path: canonicalPath(routePath) });
        }
      }
      visit(node.thenStatement, paths, methods);
      if (node.elseStatement) visit(node.elseStatement, inheritedPaths, inheritedMethods);
      return;
    }
    ts.forEachChild(node, (child) => visit(child, inheritedPaths, inheritedMethods));
  };
  visit(fetchBody);
  const unique = new Map(routes.map((route) => [`${route.worker} ${route.method} ${route.path}`, route]));
  return {
    routes: Array.from(unique.values()),
    ...pathnameSyntaxDiagnostics(fetchBody, variablePatterns),
  };
}

function extractWorkerRoutes(worker: WorkerName, relativePath: string): ExtractedWorkerRoutes {
  return extractRoutesFromSource(
    worker,
    fs.readFileSync(path.join(root, relativePath), 'utf8'),
    relativePath,
  );
}

function routeKey(route: Pick<RuntimeRoute, 'method' | 'path'>): string {
  return `${route.method} ${route.path}`;
}

describe('source-derived OpenAPI route parity', () => {
  test('extractor fixtures cover nested guards, captures, and alternation', () => {
    const fixture = `
      export default {
        async fetch(request: Request): Promise<Response> {
          const url = new URL(request.url);
          if (url.pathname === '/api/nested') {
            if (request.method === 'GET') return new Response();
          }
          const item = url.pathname.match(/^\\/api\\/items\\/([^/]+)$/);
          if ((request.method === 'PUT' || request.method === 'DELETE') && item) return new Response();
          const action = url.pathname.match(/^\\/api\\/notifications\\/([^/]+)\\/(read|dismiss)$/);
          if (request.method === 'POST' && action) return new Response();
          return new Response(null, { status: 404 });
        }
      };
    `;
    const extracted = extractRoutesFromSource('public', fixture, 'fixture.ts');
    expect(extracted.routes.map(routeKey).sort()).toEqual([
      'DELETE /items/{param}',
      'GET /nested',
      'POST /notifications/{param}/dismiss',
      'POST /notifications/{param}/read',
      'PUT /items/{param}',
    ]);
    expect(expandRuntimePattern('^\\/api\\/reputation\\/(?:users|user)\\/([^/]+)$').sort()).toEqual([
      '/api/reputation/user/{param}',
      '/api/reputation/users/{param}',
    ]);
  });

  test('all public and admin Worker dispatcher operations match the bundled contract bidirectionally', () => {
    const publicExtraction = extractWorkerRoutes('public', 'apps/lythaus-public-api/src/index.ts');
    const adminExtraction = extractWorkerRoutes('admin', 'apps/lythaus-admin-api/src/index.ts');
    const runtimeRoutes = [...publicExtraction.routes, ...adminExtraction.routes];
    expect(publicExtraction.unrecognizedPathnameSyntax).toEqual(
      Array.from(intentionalDirectPathnameUses).sort(),
    );
    expect(adminExtraction.unrecognizedPathnameSyntax).toEqual([]);
    expect(publicExtraction.unrecognizedDispatcherBranches).toEqual([]);
    expect(adminExtraction.unrecognizedDispatcherBranches).toEqual([]);
    expect(Array.from(new Set([
      ...publicExtraction.startsWithPrefixes,
      ...adminExtraction.startsWithPrefixes,
    ])).sort()).toEqual(Array.from(intentionalStartsWithPrefixes).sort());
    const routeCounts = {
      public: publicExtraction.routes.filter((route) => !internalRouteKeys.has(routeKey(route))).length,
      admin: adminExtraction.routes.filter((route) => !internalRouteKeys.has(routeKey(route))).length,
    };
    expect(routeCounts).toEqual({ public: 89, admin: 19 });
    expect(runtimeRoutes.map(routeKey)).toEqual(expect.arrayContaining([
      'GET /.well-known/jwks.json',
      'POST /auth/password/reset/request',
      'POST /appeals/{param}/vote',
      'GET /feed/news',
      'POST /waitlist',
      'DELETE /posts/{param}',
      'GET /admin/privacy/requests',
      'GET /admin/waitlist',
      'POST /admin/waitlist/{param}/status',
      'POST /admin/waitlist/{param}/retention-hold',
      'POST /admin/appeals/{param}/adjudications',
      'PUT /admin/reviewers/{param}/qualification',
    ]));
    const crossWorkerDuplicates = Array.from(new Set(runtimeRoutes.map(routeKey)))
      .filter((key) => !internalRouteKeys.has(key))
      .filter((key) => runtimeRoutes.some((route) => route.worker === 'public' && routeKey(route) === key)
        && runtimeRoutes.some((route) => route.worker === 'admin' && routeKey(route) === key))
      .sort();
    expect(crossWorkerDuplicates).toEqual([]);
    const workerByKey = new Map<string, WorkerName>();
    for (const route of runtimeRoutes) {
      const key = routeKey(route);
      if (!internalRouteKeys.has(key)) workerByKey.set(key, route.worker);
    }

    const contractKeys = new Set<string>();
    for (const [routePath, pathItem] of Object.entries<Record<string, unknown>>(contract.paths ?? {})) {
      for (const method of methodNames) {
        if ((pathItem as Record<string, unknown>)[method.toLowerCase()]) {
          const key = `${method} ${canonicalPath(routePath)}`;
          if (!internalRouteKeys.has(key)) contractKeys.add(key);
        }
      }
    }

    const runtimeKeys = new Set(workerByKey.keys());
    const missingInContract = Array.from(runtimeKeys).filter((key) => !contractKeys.has(key)).sort();
    const missingInRuntime = Array.from(contractKeys).filter((key) => !runtimeKeys.has(key)).sort();
    const misplacedAdminRoutes = runtimeRoutes
      .filter((route) => !internalRouteKeys.has(routeKey(route)))
      .filter((route) => route.path.startsWith('/admin/') !== (route.worker === 'admin'))
      .map((route) => `${route.worker} ${routeKey(route)}`)
      .sort();

    expect({ missingInContract, missingInRuntime, misplacedAdminRoutes }).toEqual({
      missingInContract: [],
      missingInRuntime: [],
      misplacedAdminRoutes: [],
    });
  });
});
