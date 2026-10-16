// Test suite for handleResponse verifying stream consumption safety and error extraction
import assert from 'node:assert';

// Extract handleResponse logic for pure unit testing against WHATWG Response
async function handleResponse(res) {
  const rawText = await res.text();

  let data = null;
  if (rawText && rawText.trim().length > 0) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    let errorDetail = '';

    if (data && typeof data === 'object') {
      if (typeof data.detail === 'string') {
        errorDetail = data.detail;
      } else if (Array.isArray(data.detail)) {
        errorDetail = data.detail.map((err) => err.msg || JSON.stringify(err)).join(', ');
      } else if (data.message && typeof data.message === 'string') {
        errorDetail = data.message;
      } else {
        errorDetail = JSON.stringify(data);
      }
    } else if (rawText && rawText.trim().length > 0) {
      errorDetail = rawText.trim();
    }

    throw new Error(errorDetail || `Request failed with status ${res.status}`);
  }

  if (data !== null) {
    return data;
  }

  return rawText ? rawText : {};
}

async function runTests() {
  console.log('--- Testing handleResponse against WHATWG Response ---');

  // Test 1: Successful JSON response
  {
    const res = new Response(JSON.stringify({ access_token: 'xyz', user: { id: 1 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await handleResponse(res);
    assert.strictEqual(result.access_token, 'xyz');
    assert.strictEqual(result.user.id, 1);
    console.log('✓ Test 1 Passed: Valid JSON response parsed correctly');
  }

  // Test 2: Successful 204 No Content (empty body)
  {
    const res = new Response(null, { status: 204 });
    const result = await handleResponse(res);
    assert.deepStrictEqual(result, {});
    console.log('✓ Test 2 Passed: 204 No Content empty body handled safely');
  }

  // Test 3: FastAPI 401 JSON error with detail string
  {
    const res = new Response(JSON.stringify({ detail: 'Incorrect email or password' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
    await assert.rejects(
      async () => await handleResponse(res),
      (err) => {
        assert.strictEqual(err.message, 'Incorrect email or password');
        return true;
      }
    );
    console.log('✓ Test 3 Passed: FastAPI 401 error message extracted cleanly');
  }

  // Test 4: FastAPI 422 validation error array
  {
    const res = new Response(
      JSON.stringify({
        detail: [
          { loc: ['body', 'email'], msg: 'value is not a valid email address', type: 'value_error' }
        ]
      }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    );
    await assert.rejects(
      async () => await handleResponse(res),
      (err) => {
        assert.strictEqual(err.message, 'value is not a valid email address');
        return true;
      }
    );
    console.log('✓ Test 4 Passed: FastAPI 422 validation array formatted cleanly');
  }

  // Test 5: Empty 404 response (The exact reproduction of the user issue!)
  {
    const res = new Response('', { status: 404, statusText: 'Not Found' });
    // In the old code, this threw: "TypeError: Failed to execute 'text' on 'Response': body stream already read"
    await assert.rejects(
      async () => await handleResponse(res),
      (err) => {
        assert.doesNotMatch(err.message, /body stream already read/i);
        assert.match(err.message, /Request failed with status 404/);
        return true;
      }
    );
    console.log('✓ Test 5 Passed: Empty 404 response does NOT throw body stream already read');
  }

  // Test 6: HTML / Non-JSON 502 Bad Gateway response
  {
    const htmlBody = '<!DOCTYPE html><html><body>502 Bad Gateway</body></html>';
    const res = new Response(htmlBody, { status: 502, statusText: 'Bad Gateway' });
    await assert.rejects(
      async () => await handleResponse(res),
      (err) => {
        assert.doesNotMatch(err.message, /body stream already read/i);
        assert.strictEqual(err.message, htmlBody);
        return true;
      }
    );
    console.log('✓ Test 6 Passed: HTML error response handled safely without stream errors');
  }

  console.log('\nAll 6 handleResponse unit tests PASSED successfully!\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
