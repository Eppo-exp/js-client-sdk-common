import { logger } from './application-logger';
import {
  Cacheable,
  AssignmentCache,
  NonExpiringInMemoryAssignmentCache,
  LRUInMemoryAssignmentCache,
} from './assignment-cache';
import { IAssignmentHooks } from './assignment-hooks';
import { IAssignmentLogger, IAssignmentEvent } from './assignment-logger';
import EppoClient, { FlagConfigurationRequestParameters, IEppoClient } from './client/eppo-client';
import FlagConfigRequestor from './configuration-requestor';
import {
  IConfigurationStore,
  IAsyncStore,
  ISyncStore,
} from './configuration-store/configuration-store';
import { HybridConfigurationStore } from './configuration-store/hybrid.store';
import { MemoryStore, MemoryOnlyConfigurationStore } from './configuration-store/memory.store';
import * as constants from './constants';
import HttpClient from './http-client';
import { Flag, VariationType } from './interfaces';
import { AttributeType, Attributes } from './types';
import * as validation from './validation';

export {
  logger as applicationLogger,
  IAssignmentHooks,
  IAssignmentLogger,
  IAssignmentEvent,
  EppoClient,
  IEppoClient,
  constants,
  FlagConfigRequestor,
  HttpClient,
  validation,

  // Configuration store
  IConfigurationStore,
  IAsyncStore,
  ISyncStore,
  MemoryStore,
  HybridConfigurationStore,
  MemoryOnlyConfigurationStore,

  // Assignment cache
  AssignmentCache,
  Cacheable,
  NonExpiringInMemoryAssignmentCache,
  LRUInMemoryAssignmentCache,

  // Interfaces
  FlagConfigurationRequestParameters,
  Flag,
  VariationType,
  AttributeType,
  Attributes,
};
