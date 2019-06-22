import { get, hasApiKey, post, setApiKey } from "../api";
import { ActionTree, Module } from "vuex";
import { AuthState, RootState } from "./types";

export const AuthStore: Module<AuthState, RootState> = {
  namespaced: true,

  state: {
    apiKey: null,
    loadedInitialAuth: false,
  },

  actions: {
    async loadInitialAuth({ dispatch, commit, state }) {
      if (state.loadedInitialAuth) return;

      const storedKey = localStorage.getItem("apiKey");
      if (storedKey) {
        console.log("key?", storedKey);
        const result = await post("auth/validate-key", { key: storedKey });
        if (result.isValid) {
          await dispatch("setApiKey", storedKey);
        } else {
          localStorage.removeItem("apiKey");
        }
      }

      commit("markInitialAuthLoaded");
    },

    setApiKey({ commit, state }, newKey: string) {
      localStorage.setItem("apiKey", newKey);
      commit("setApiKey", newKey);
    },
  },

  mutations: {
    setApiKey(state: AuthState, key) {
      state.apiKey = key;
    },

    markInitialAuthLoaded(state: AuthState) {
      state.loadedInitialAuth = true;
    },
  },
};