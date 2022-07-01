# Eppo JS SDK for Browser Applications

[![](https://img.shields.io/npm/v/@eppo/js-client-sdk)](https://www.npmjs.com/package/@eppo/js-client-sdk)
[![](https://img.shields.io/static/v1?label=GitHub+Pages&message=API+reference&color=00add8)](https://eppo-exp.github.io/js-client-sdk/js-client-sdk.html)

This SDK is for client-side JS applications that run in a web browser. For server-side JS applications, use Eppo's [server-side Node JS SDK](https://github.com/Eppo-exp/node-server-sdk).

## Getting Started

Refer to our [SDK documentation](https://docs.geteppo.com/feature-flagging/randomization-sdk) for how to install and use the SDK.

## Usage with React

For usage in React applications, we recommend creating a [Context](https://reactjs.org/docs/context.html) provider to intialize the SDK and store the initialization status.

```tsx
import { useEffect, useState, createContext } from 'react';
import * as EppoSdk from '@eppo/js-client-sdk';

const EppoContext = createContext({ isInitialized: false });

function EppoProvider({ children }): JSX.Element {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    EppoSdk.init({ apiKey: '<API-KEY>' })
      .then(() => setIsInitialized(true));
  }, []);

  return (
     <EppoContext.Provider value={{ isInitialized }}>
        {children}
     </EppoContext.Provider>
  );
}
```

Use the context provider at the root of your component tree to wrap the rest of your application:

```tsx
<EppoProvider>
   <MyApp />
</EppoProvider>
```

React components in your application should consume the context to check that the SDK has been initialized before assigning a variation. (Alternatively, you could have the `EppoProvider` wait to render its children until the SDK is initialized.)

```tsx
import { useContext } from 'react';
import * as EppoSdk from '@eppo/js-client-sdk';

const { isInitialized } = useContext(EppoContext);
if (isInitialized) {
  const assignedVariation = EppoSdk.getInstance().getAssignment(subjectKey, experimentKey);
  ...
}
```


