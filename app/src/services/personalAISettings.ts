export function readPersonalAI() {
  try {
    return {
      apiKey: localStorage.getItem('openai_api_key') || '',
      baseUrl: localStorage.getItem('openai_api_base') || '',
      model: localStorage.getItem('openai_model') || '',
    };
  } catch {
    return {apiKey:'',baseUrl:'',model:''};
  }
}
