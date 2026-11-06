import { act, cleanup, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import type { Store } from 'redux';
import { GlobalActions } from 'actions/GlobalActions';
import { GraphToolbarActions } from 'actions/GraphToolbarActions';
import type { KialiAppAction } from 'actions/KialiAppAction';
import { serverConfig, setServerConfig } from 'config/ServerConfig';
import { rootReducer } from 'reducers';
import { INITIAL_STATUS_STATE } from 'reducers/HelpDropdownState';
import * as API from 'services/Api';
import { LoginStatus } from 'store/Store';
import type { KialiAppState } from 'store/Store';
import { AuthenticationController } from '../AuthenticationController';

const originalServerConfig = structuredClone(serverConfig);

const createAuthenticatedStore = (): Store<KialiAppState, KialiAppAction> => {
  const state = rootReducer(undefined, GlobalActions.unknown());
  return createStore(rootReducer, {
    ...state,
    authentication: { ...state.authentication, status: LoginStatus.loggedIn }
  });
};

describe('Graph Display menu UI defaults', () => {
  let testStore: ReturnType<typeof createAuthenticatedStore>;
  let configuration: typeof serverConfig;

  beforeEach(() => {
    testStore = createAuthenticatedStore();
    configuration = structuredClone(originalServerConfig);
    configuration.prometheus.enabled = true;
    configuration.kialiFeatureFlags.uiDefaults.graph.displayMenu = {};

    rstest.spyOn(API, 'getNamespaces').mockResolvedValue({ data: [] });
    rstest.spyOn(API, 'getServerConfig').mockImplementation(async () => ({ data: configuration }));
    rstest.spyOn(API, 'getStatus').mockResolvedValue({ data: INITIAL_STATUS_STATE });
    rstest.spyOn(API, 'getTracingInfo').mockResolvedValue({
      data: {
        enabled: false,
        integration: false,
        internalURL: '',
        namespaceSelector: false,
        provider: '',
        url: '',
        whiteListIstioSystem: []
      }
    });
  });

  afterEach(() => {
    cleanup();
    rstest.restoreAllMocks();
    setServerConfig(structuredClone(originalServerConfig));
  });

  const initialize = async (): Promise<void> => {
    render(
      <Provider store={testStore}>
        <AuthenticationController
          protectedAreaComponent={<div>Graph initialized</div>}
          publicAreaComponent={() => <div>Login</div>}
        />
      </Provider>
    );
    await screen.findByText('Graph initialized');
  };

  it('preserves the built-in badge defaults when no overrides are configured', async () => {
    await initialize();

    const toolbar = testStore.getState().graph.toolbarState;
    expect(toolbar.showOutOfMesh).toBe(true);
    expect(toolbar.showSecurity).toBe(false);
    expect(toolbar.showVirtualServices).toBe(true);
  });

  it('disables Virtual Services when explicitly configured false', async () => {
    configuration.kialiFeatureFlags.uiDefaults.graph.displayMenu = { virtual_services: false };

    await initialize();

    expect(testStore.getState().graph.toolbarState.showVirtualServices).toBe(false);
    expect(testStore.getState().graph.toolbarState.showOutOfMesh).toBe(true);
  });

  it('enables Security without changing Missing Sidecars', async () => {
    configuration.kialiFeatureFlags.uiDefaults.graph.displayMenu = { security: true };

    await initialize();

    expect(testStore.getState().graph.toolbarState.showSecurity).toBe(true);
    expect(testStore.getState().graph.toolbarState.showOutOfMesh).toBe(true);
  });

  it('disables Missing Sidecars without changing Security', async () => {
    configuration.kialiFeatureFlags.uiDefaults.graph.displayMenu = { missing_sidecars: false };

    await initialize();

    expect(testStore.getState().graph.toolbarState.showOutOfMesh).toBe(false);
    expect(testStore.getState().graph.toolbarState.showSecurity).toBe(false);
  });

  it('leaves options unchanged when configured values already match their state', async () => {
    configuration.kialiFeatureFlags.uiDefaults.graph.displayMenu = {
      missing_sidecars: true,
      security: false,
      virtual_services: true
    };

    await initialize();

    const toolbar = testStore.getState().graph.toolbarState;
    expect(toolbar.showOutOfMesh).toBe(true);
    expect(toolbar.showSecurity).toBe(false);
    expect(toolbar.showVirtualServices).toBe(true);
  });

  it('warns about an unknown option and still applies a subsequent valid override', async () => {
    const warning = rstest.spyOn(console, 'warn').mockImplementation(() => {});
    configuration.kialiFeatureFlags.uiDefaults.graph.displayMenu = {
      virtual_servcies: false,
      virtual_services: false
    };

    await initialize();

    expect(warning).toHaveBeenCalledWith(expect.stringContaining('virtual_servcies'));
    expect(testStore.getState().graph.toolbarState.showVirtualServices).toBe(false);
  });

  it('treats inherited object property names as unsupported options', async () => {
    const warning = rstest.spyOn(console, 'warn').mockImplementation(() => {});
    configuration.kialiFeatureFlags.uiDefaults.graph.displayMenu = {
      constructor: false,
      virtual_services: false
    };

    await initialize();

    expect(warning).toHaveBeenCalledWith(expect.stringContaining('constructor'));
    expect(testStore.getState().graph.toolbarState.showVirtualServices).toBe(false);
  });

  it('keeps an applied override when initialization runs again', async () => {
    configuration.kialiFeatureFlags.uiDefaults.graph.displayMenu = { virtual_services: false };
    await initialize();
    expect(testStore.getState().graph.toolbarState.showVirtualServices).toBe(false);
    cleanup();

    await initialize();

    expect(testStore.getState().graph.toolbarState.showVirtualServices).toBe(false);
  });

  it('allows users to change a badge after installation defaults have been applied', async () => {
    configuration.kialiFeatureFlags.uiDefaults.graph.displayMenu = { virtual_services: false };
    await initialize();
    expect(testStore.getState().graph.toolbarState.showVirtualServices).toBe(false);

    act(() => {
      testStore.dispatch(GraphToolbarActions.toggleGraphVirtualServices());
    });

    expect(testStore.getState().graph.toolbarState.showVirtualServices).toBe(true);
  });
});
