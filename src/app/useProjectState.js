import useProject from "../useProject.js";
export default function useProjectState() {
  const state = useProject();
  return {
    ...state,
    projectRef: state.ref,
    ids: state.project.ids,
    overrides: state.project.overrides,
  };
}
